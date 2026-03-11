import http from "http";
import { spawn, execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const BASE_DIR   = __dirname;

// RUNTIME_DIR: writable directory for PID files, session state, and config.
// In Electron mode, set to ~/Library/Application Support/SalesOverlay by main.js.
// In CLI mode, falls back to the script directory.
const RUNTIME_DIR = process.env.OVERLAY_RUNTIME_DIR || BASE_DIR;

// ── Config: RUNTIME_DIR first, then BASE_DIR as fallback ──────────────────────
let config = {};
function loadConfig() {
  for (const dir of [RUNTIME_DIR, BASE_DIR]) {
    try {
      const cfgPath = path.join(dir, 'config.json');
      if (fs.existsSync(cfgPath)) {
        return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      }
    } catch (_) {}
  }
  return {};
}
config = loadConfig();

const PORT  = Number(process.env.PORT         || config.overlay_port  || 8787);
const TOKEN = process.env.OVERLAY_TOKEN        || config.overlay_token || 'change-me';
let   TIPS_URL    = process.env.N8N_TIPS_URL   || config.n8n_tips_url    || '';
let   WEBHOOK_URL = process.env.N8N_WEBHOOK_URL|| config.n8n_webhook_url  || '';
let   SUPABASE_URL      = process.env.SUPABASE_URL       || config.supabase_url       || '';
let   SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY  || config.supabase_anon_key  || '';
let   AUTH_MODE         = process.env.SUPABASE_AUTH_MODE || config.supabase_auth_mode || 'magic_link';
let   pendingAuthSession = null; // temporärer Speicher zwischen Callback-Tab und Overlay-Poll

// Update support
const GITHUB_REPO = process.env.GITHUB_REPO    || config.github_repo    || '';
const APP_PATH    = process.env.SALES_APP_PATH || '';

let updateState = { progress: 0, done: false, error: null };

// Read package version
let APP_VERSION = '1.0.0';
try {
  APP_VERSION = JSON.parse(fs.readFileSync(path.join(BASE_DIR, 'package.json'), 'utf8')).version;
} catch (_) {}

const SCRIPT        = process.env.SCRIPT || path.join(BASE_DIR, 'run_bridges.sh');
const PID_FILE      = path.join(RUNTIME_DIR, '.overlay_runner_pids');
const CHILD_PID_FILE= path.join(RUNTIME_DIR, '.bridge_child_pids');
const CALL_SESSION_ENV = path.join(RUNTIME_DIR, 'call_session.env');
const OVERLAY_HTML  = path.join(BASE_DIR, 'overlay.html');

// ── Helpers ───────────────────────────────────────────────────────────────────
function isRunning() {
  if (!fs.existsSync(PID_FILE)) return false;

  let pids = [];
  try {
    pids = fs.readFileSync(PID_FILE, 'utf8')
      .split('\n').map(x => x.trim()).filter(Boolean)
      .map(Number).filter(n => Number.isFinite(n) && n > 0);
  } catch (_) { return false; }

  if (!pids.length) {
    try { fs.unlinkSync(PID_FILE); } catch (_) {}
    return false;
  }

  for (const pid of pids) {
    try { process.kill(pid, 0); return true; } catch (_) {}
  }

  try { fs.unlinkSync(PID_FILE); } catch (_) {}
  return false;
}

function getCurrentSessionId() {
  try {
    if (!fs.existsSync(CALL_SESSION_ENV)) return null;
    const content = fs.readFileSync(CALL_SESSION_ENV, 'utf8');
    const match   = content.match(/CALL_SESSION_ID="([^"]+)"/);
    return match ? match[1] : null;
  } catch (_) { return null; }
}

function runScript() {
  return new Promise((resolve) => {
    if (isRunning()) return resolve({ ok: false, error: "already_running" });

    const p = spawn('bash', [SCRIPT], {
      stdio: 'inherit',
      detached: true,
      cwd: BASE_DIR,
      env: { ...process.env, OVERLAY_RUNTIME_DIR: RUNTIME_DIR, N8N_WEBHOOK_URL: WEBHOOK_URL },
    });

    try { fs.writeFileSync(PID_FILE, String(p.pid) + "\n", "utf8"); } catch (_) {}
    p.unref();
    p.on("error", () => resolve({ ok: false, error: "spawn_failed" }));
    setTimeout(() => resolve({ ok: true }), 300);
  });
}

function stopScript() {
  if (!fs.existsSync(PID_FILE)) {
    // Fallback: direct bridge kills even without runner pidfile
    try {
      if (fs.existsSync(CHILD_PID_FILE)) {
        const childPids = fs.readFileSync(CHILD_PID_FILE, "utf8")
          .split("\n").map(x => x.trim()).filter(Boolean)
          .map(Number).filter(n => Number.isFinite(n) && n > 0);
        for (const pid of childPids) {
          try { process.kill(pid, "SIGTERM"); } catch (_) {}
        }
      }
    } catch (_) {}

    try { execSync("pkill -TERM -f 'bridge_mic\\.mjs'",    { stdio: "ignore" }); } catch (_) {}
    try { execSync("pkill -TERM -f 'bridge_system\\.mjs'", { stdio: "ignore" }); } catch (_) {}
    try { execSync("pkill -TERM -f 'ffmpeg.*avfoundation'",{ stdio: "ignore" }); } catch (_) {}
    try { fs.unlinkSync(CHILD_PID_FILE); } catch (_) {}

    return { ok: false, error: "not_running" };
  }

  let pids = [];
  try {
    pids = fs.readFileSync(PID_FILE, "utf8")
      .split("\n").map(x => x.trim()).filter(Boolean)
      .map(Number).filter(n => Number.isFinite(n) && n > 0);
  } catch (_) { pids = []; }

  if (!pids.length) {
    try { fs.unlinkSync(PID_FILE); } catch (_) {}
    return { ok: false, error: "not_running" };
  }

  for (const pid of pids) {
    try { process.kill(-pid, "SIGTERM"); } catch (_) {
      try { process.kill(pid, "SIGTERM"); } catch (_) {}
    }
  }

  try { execSync("pkill -TERM -f 'run_bridges\\.sh'",    { stdio: "ignore" }); } catch (_) {}
  try { execSync("pkill -TERM -f 'bridge_mic\\.mjs'",    { stdio: "ignore" }); } catch (_) {}
  try { execSync("pkill -TERM -f 'bridge_system\\.mjs'", { stdio: "ignore" }); } catch (_) {}
  try { execSync("pkill -TERM -f 'ffmpeg.*avfoundation'",{ stdio: "ignore" }); } catch (_) {}

  setTimeout(() => {
    for (const pid of pids) {
      try { process.kill(-pid, 0); process.kill(-pid, "SIGKILL"); } catch (_) {
        try { process.kill(pid, 0); process.kill(pid, "SIGKILL"); } catch (_) {}
      }
    }
    try { execSync("pkill -KILL -f 'run_bridges\\.sh'",    { stdio: "ignore" }); } catch (_) {}
    try { execSync("pkill -KILL -f 'bridge_mic\\.mjs'",    { stdio: "ignore" }); } catch (_) {}
    try { execSync("pkill -KILL -f 'bridge_system\\.mjs'", { stdio: "ignore" }); } catch (_) {}
    try { execSync("pkill -KILL -f 'ffmpeg.*avfoundation'",{ stdio: "ignore" }); } catch (_) {}
  }, 700);

  try { fs.unlinkSync(PID_FILE); }       catch (_) {}
  try { fs.unlinkSync(CHILD_PID_FILE); } catch (_) {}
  return { ok: true };
}

function readPidsSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8')
      .split('\n').map(x => x.trim()).filter(Boolean)
      .map(Number).filter(n => Number.isFinite(n) && n > 0);
  } catch (_) { return []; }
}

function alivePids(pids) {
  return pids.filter(pid => {
    try { process.kill(pid, 0); return true; } catch (_) { return false; }
  });
}

function getStatusPayload() {
  const runnerPids  = fs.existsSync(PID_FILE)       ? readPidsSafe(PID_FILE)       : [];
  const childPids   = fs.existsSync(CHILD_PID_FILE) ? readPidsSafe(CHILD_PID_FILE) : [];
  const runnerAlive = alivePids(runnerPids);
  const childAlive  = alivePids(childPids);
  const running     = runnerAlive.length > 0 || childAlive.length > 0;

  return {
    ok: true,
    running,
    sessionId: getCurrentSessionId(),
    runner: {
      pid_file: PID_FILE,
      exists: fs.existsSync(PID_FILE),
      pids: runnerPids,
      alive: runnerAlive,
    },
    child: {
      pid_file: CHILD_PID_FILE,
      exists: fs.existsSync(CHILD_PID_FILE),
      pids: childPids,
      alive: childAlive,
    },
    ts: new Date().toISOString(),
  };
}

function hardStopAll() {
  try { stopScript(); } catch (_) {}
  try { execSync("pkill -KILL -f 'run_bridges\\.sh'",    { stdio: 'ignore' }); } catch (_) {}
  try { execSync("pkill -KILL -f 'bridge_mic\\.mjs'",    { stdio: 'ignore' }); } catch (_) {}
  try { execSync("pkill -KILL -f 'bridge_system\\.mjs'", { stdio: 'ignore' }); } catch (_) {}
  try { execSync("pkill -KILL -f 'ffmpeg.*avfoundation'",{ stdio: 'ignore' }); } catch (_) {}
  try { fs.unlinkSync(PID_FILE); }       catch (_) {}
  try { fs.unlinkSync(CHILD_PID_FILE); } catch (_) {}
  return { ok: true };
}

function resetSessionEnv() {
  try { fs.unlinkSync(CALL_SESSION_ENV); } catch (_) {}
}

// ── HTTP Server ───────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Token");

  if (req.method === "OPTIONS") {
    res.writeHead(204); return res.end();
  }

  // ── Public routes (no token required) ────────────────────────────────────
  if (req.url === "/" && req.method === "GET") {
    try {
      const html = fs.readFileSync(OVERLAY_HTML, 'utf8');
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(html);
    } catch (_) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("overlay.html nicht gefunden");
    }
  }

  // ── Static SVG assets ─────────────────────────────────────────────────────
  if (req.method === "GET" && /^\/ViralHouse_(white|black)\.svg$|^\/BM_orange\.svg$/.test(req.url)) {
    try {
      const svgPath = path.join(BASE_DIR, req.url.slice(1));
      const svg = fs.readFileSync(svgPath);
      res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "max-age=86400" });
      return res.end(svg);
    } catch (_) {
      res.writeHead(404); return res.end('not found');
    }
  }

  // ── Auth Callback: Magic Link landet hier, Session wird zwischengespeichert ──
  if (req.url.startsWith('/auth/callback')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(`<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  *{box-sizing:border-box;}
  body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0d1117;color:#fff;}
  .box{text-align:center;padding:2rem;max-width:360px;width:100%;}
  #resetForm{margin-top:1.2rem;display:flex;flex-direction:column;gap:.7rem;}
  #resetForm input{padding:.6rem .9rem;border-radius:6px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.07);color:#fff;font-size:.95rem;outline:none;}
  #resetForm input:focus{border-color:#4ade80;}
  #pwBtn{padding:.65rem;border-radius:6px;background:#4ade80;color:#0d1117;font-weight:700;border:none;cursor:pointer;font-size:.95rem;}
  #pwBtn:disabled{opacity:.5;cursor:not-allowed;}
  #pwErr{color:#f87171;font-size:.85rem;margin-top:.2rem;display:none;}
  #pwOk{color:#4ade80;font-size:.9rem;margin-top:.5rem;}
</style>
</head><body><div class="box">
<p id="msg">Link wird geprüft...</p>
<div id="resetForm" style="display:none;">
  <input type="password" id="pw1" placeholder="Neues Passwort (min. 6 Zeichen)">
  <input type="password" id="pw2" placeholder="Passwort wiederholen">
  <button id="pwBtn" onclick="submitPw()">Passwort speichern</button>
  <p id="pwErr"></p>
</div>
</div>
<script>
const SUPA_URL = '${SUPABASE_URL}';
const SUPA_KEY = '${SUPABASE_ANON_KEY}';
const msgEl    = document.getElementById('msg');

// Parse hash (implicit flow) and query params (PKCE flow)
const hash       = window.location.hash.substring(1);
const hashParams = new URLSearchParams(hash);
const qParams    = new URLSearchParams(window.location.search);

const access_token  = hashParams.get('access_token');
const refresh_token = hashParams.get('refresh_token') || '';
const type          = hashParams.get('type') || qParams.get('type') || '';
const code          = qParams.get('code');

if (access_token && type === 'recovery') {
  // ── Password-Reset (implicit flow) ───────────────────────────────────────
  msgEl.textContent = 'Neues Passwort eingeben:';
  document.getElementById('resetForm').style.display = 'flex';

  window.submitPw = async function() {
    const pw1   = document.getElementById('pw1').value;
    const pw2   = document.getElementById('pw2').value;
    const pwErr = document.getElementById('pwErr');
    const btn   = document.getElementById('pwBtn');
    pwErr.style.display = 'none';
    if (pw1.length < 6) { pwErr.textContent = 'Mind. 6 Zeichen erforderlich.'; pwErr.style.display = 'block'; return; }
    if (pw1 !== pw2)    { pwErr.textContent = 'Passwörter stimmen nicht überein.'; pwErr.style.display = 'block'; return; }
    btn.disabled = true; btn.textContent = 'Wird gespeichert...';
    try {
      const r = await fetch(SUPA_URL + '/auth/v1/user', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + access_token, 'apikey': SUPA_KEY },
        body: JSON.stringify({ password: pw1 })
      });
      if (r.ok) {
        document.getElementById('resetForm').style.display = 'none';
        msgEl.innerHTML = '✅ Passwort geändert!<br><small style="opacity:.6">Geh zurück zur App und melde dich mit deinem neuen Passwort an.</small>';
      } else {
        const err = await r.json().catch(() => ({}));
        pwErr.textContent = '❌ ' + (err.message || err.error_description || 'Unbekannter Fehler.');
        pwErr.style.display = 'block';
        btn.disabled = false; btn.textContent = 'Passwort speichern';
      }
    } catch (e) {
      pwErr.textContent = '❌ Verbindungsfehler: ' + e.message;
      pwErr.style.display = 'block';
      btn.disabled = false; btn.textContent = 'Passwort speichern';
    }
  };

} else if (access_token) {
  // ── Normaler Login / Magic Link (implicit flow) ───────────────────────────
  msgEl.textContent = 'Einloggen...';
  fetch('/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Token': '${TOKEN}' },
    body: JSON.stringify({ access_token, refresh_token })
  }).then(r => r.ok
    ? (msgEl.innerHTML = '✅ Eingeloggt! Fenster schließt...', setTimeout(() => window.close(), 1500))
    : (msgEl.textContent = '❌ Session konnte nicht gespeichert werden.')
  ).catch(() => { msgEl.textContent = '❌ Verbindungsfehler.'; });

} else if (code) {
  // ── PKCE flow ─────────────────────────────────────────────────────────────
  // code_verifier lives in the tab that called resetPasswordForEmail() — not available here.
  // Supabase PKCE reset via external browser requires server-side code exchange (not supported).
  msgEl.innerHTML = '⚠️ PKCE-Flow erkannt.<br><small style="opacity:.6">Bitte stelle in den Supabase-Einstellungen unter Authentication → Email den Auth Flow Type auf <b>Implicit</b> um, damit der Passwort-Reset in der App funktioniert.</small>';

} else {
  msgEl.textContent = '❌ Kein Token im Link gefunden. Bitte fordere einen neuen Reset-Link an.';
}
</script></body></html>`);
  }

  // ── Auth Session: empfängt Token vom Callback-Tab ─────────────────────────
  if (req.url === '/auth/session' && req.method === 'POST') {
    if (req.headers['x-token'] !== TOKEN) { res.writeHead(401); return res.end('unauthorized'); }
    let body = ''; req.on('data', c => { body += c; });
    req.on('end', () => {
      try {
        pendingAuthSession = JSON.parse(body);
        res.writeHead(200); res.end('ok');
      } catch (_) { res.writeHead(400); res.end('bad request'); }
    });
    return;
  }

  // ── Auth Status: Overlay pollt hier ob Session bereit ist ─────────────────
  if (req.url === '/auth/status' && req.method === 'GET') {
    if (req.headers['x-token'] !== TOKEN) { res.writeHead(401); return res.end('unauthorized'); }
    const session = pendingAuthSession;
    pendingAuthSession = null;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ session: session || null }));
  }

  if (req.url === "/config" && req.method === "GET") {
    const isPlaceholder = (v) => !v || v.includes('DEIN') || v.includes('example');
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      token:       TOKEN,
      tipsUrl:     TIPS_URL,
      webhookUrl:  WEBHOOK_URL,
      supabaseUrl: SUPABASE_URL,
      supabaseAnonKey: SUPABASE_ANON_KEY,
      authMode: AUTH_MODE,
      setupNeeded: isPlaceholder(WEBHOOK_URL) || isPlaceholder(TIPS_URL),
      hasUpdater:  !!GITHUB_REPO,
      version:     APP_VERSION,
    }));
  }

  // ── Save config (no token required — used by first-launch setup screen) ──
  if (req.url === "/save-config" && req.method === "POST") {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (!data.webhookUrl || !data.tipsUrl) {
          res.writeHead(400, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ ok: false, error: 'missing_fields' }));
        }
        WEBHOOK_URL = data.webhookUrl;
        TIPS_URL    = data.tipsUrl;
        if (typeof data.supabaseUrl === 'string') SUPABASE_URL = data.supabaseUrl.trim();
        if (typeof data.supabaseAnonKey === 'string') SUPABASE_ANON_KEY = data.supabaseAnonKey.trim();
        if (typeof data.authMode === 'string' && data.authMode.trim()) AUTH_MODE = data.authMode.trim();

        const cfgFile = path.join(RUNTIME_DIR, 'config.json');
        let existing = {};
        try { existing = JSON.parse(fs.readFileSync(cfgFile, 'utf8')); } catch (_) {}
        fs.writeFileSync(cfgFile, JSON.stringify({
          ...existing,
          n8n_webhook_url: data.webhookUrl,
          n8n_tips_url:    data.tipsUrl,
          supabase_url: SUPABASE_URL,
          supabase_anon_key: SUPABASE_ANON_KEY,
          supabase_auth_mode: AUTH_MODE,
        }, null, 2));

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  // ── Protected routes ─────────────────────────────────────────────────────
  const token = req.headers["x-token"];
  if (token !== TOKEN) {
    res.writeHead(403, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: false, error: "forbidden" }));
  }

  if (req.url === "/status" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(getStatusPayload()));
  }

  if (req.url === "/hard-stop" && req.method === "POST") {
    hardStopAll();
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: true }));
  }

  if (req.url === "/run" && req.method === "POST") {
    const result = await runScript();
    res.writeHead(result.ok ? 200 : 409, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(result));
  }

  if (req.url === "/stop" && req.method === "POST") {
    const result = stopScript();
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(result.ok ? { ok: true } : result));
  }

  if (req.url === "/new-session" && req.method === "POST") {
    stopScript();
    try { fs.unlinkSync(PID_FILE); }       catch (_) {}
    try { fs.unlinkSync(CHILD_PID_FILE); } catch (_) {}
    resetSessionEnv();
    const result = await runScript();
    res.writeHead(result.ok ? 200 : 409, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(result.ok ? { ok: true } : result));
  }

  // ── Check for update ──────────────────────────────────────────────────────
  if (req.url === "/check-update" && req.method === "GET") {
    if (!GITHUB_REPO) {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ hasUpdate: false, error: 'no_repo' }));
    }
    try {
      const apiRes = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
        { headers: { 'User-Agent': 'SalesOverlay' }, signal: AbortSignal.timeout(8000) }
      );
      if (!apiRes.ok) throw new Error(`GitHub API: ${apiRes.status}`);
      const release = await apiRes.json();
      const latest  = release.tag_name.replace(/^v/, '');
      const asset   = release.assets?.find(a => a.name === 'SalesOverlay.app.zip');
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        current:     APP_VERSION,
        latest,
        hasUpdate:   latest !== APP_VERSION,
        downloadUrl: asset?.browser_download_url || null,
      }));
    } catch (e) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ hasUpdate: false, error: e.message }));
    }
    return;
  }

  // ── Download and prepare update ───────────────────────────────────────────
  if (req.url === "/do-update" && req.method === "POST") {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { downloadUrl } = JSON.parse(body);
        if (!downloadUrl || !APP_PATH) {
          res.writeHead(400, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ ok: false, error: 'no_download_url_or_app_path' }));
        }
        // Respond immediately — download runs in background
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, downloading: true }));

        // Background download + extract
        const zipPath  = '/tmp/SalesOverlay-update.zip';
        const tmpDir   = '/tmp/SalesOverlay-extracted';
        const scriptPath = '/tmp/sales-overlay-update.sh';
        updateState.progress = 0; updateState.done = false; updateState.error = null;
        try {
          const dl = await fetch(downloadUrl, { signal: AbortSignal.timeout(180000) });
          if (!dl.ok) throw new Error(`Download fehlgeschlagen: ${dl.status}`);
          const contentLength = parseInt(dl.headers.get('content-length') || '0');
          let downloaded = 0;
          const chunks = [];
          for await (const chunk of dl.body) {
            chunks.push(chunk);
            downloaded += chunk.length;
            if (contentLength > 0) updateState.progress = Math.round((downloaded / contentLength) * 90);
          }
          const buf = Buffer.concat(chunks);
          fs.writeFileSync(zipPath, buf);
          updateState.progress = 95;

          execSync(`rm -rf "${tmpDir}" && unzip -o "${zipPath}" -d "${tmpDir}"`, { stdio: 'ignore' });
          const newApp = execSync(
            `find "${tmpDir}" -name "*.app" -maxdepth 3 | head -1`, { encoding: 'utf8' }
          ).trim();
          if (!newApp) throw new Error('Keine .app im ZIP gefunden');

          const parentDir = path.dirname(APP_PATH);
          const newAppName = path.basename(newApp);
          const finalAppPath = path.join(parentDir, newAppName);
          const script = [
            '#!/bin/bash',
            'sleep 3',
            `rm -rf "${APP_PATH}"`,
            `rm -rf "${finalAppPath}"`,
            `cp -R "${newApp}" "${parentDir}/"`,
            `rm -rf "${tmpDir}" "${zipPath}"`,
            `xattr -dr com.apple.quarantine "${finalAppPath}" 2>/dev/null || true`,
            `codesign --force --deep --sign - "${finalAppPath}" 2>/dev/null || true`,
            `open "${finalAppPath}"`,
          ].join('\n');
          fs.writeFileSync(scriptPath, script, { mode: 0o755 });

          // Signal main.js to quit + run update script
          fs.writeFileSync(
            path.join(RUNTIME_DIR, 'update_pending.json'),
            JSON.stringify({ updateScript: scriptPath })
          );
          updateState.done = true;
          updateState.progress = 100;
        } catch (e) {
          console.error('Update-Download fehlgeschlagen:', e.message);
          updateState.error = e.message;
          // Write error flag so overlay can show it
          fs.writeFileSync(
            path.join(RUNTIME_DIR, 'update_error.json'),
            JSON.stringify({ error: e.message })
          );
        }
      } catch (e) {
        // Headers already sent, just log
        console.error('do-update parse error:', e.message);
      }
    });
    return;
  }

  // ── Update status (poll while downloading) ────────────────────────────────
  if (req.url === "/update-status" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      progress: updateState.progress,
      done:     updateState.done,
      error:    updateState.error,
      pending:  updateState.done,
    }));
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: false, error: "not_found" }));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`✅  Overlay Control → http://127.0.0.1:${PORT}`);
  console.log(`    Token:  ${TOKEN}`);
  console.log(`    Script: ${SCRIPT}`);
});
