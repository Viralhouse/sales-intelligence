import http from "http";
import { spawn, execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const BASE_DIR   = __dirname;

// ── Config (config.json > env vars > defaults) ────────────────────────────────
let config = {};
try {
  const cfgPath = path.join(BASE_DIR, 'config.json');
  if (fs.existsSync(cfgPath)) {
    config = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  }
} catch (e) {
  console.warn('⚠️  config.json nicht lesbar:', e.message);
}

const PORT  = Number(process.env.PORT         || config.overlay_port  || 8787);
const TOKEN = process.env.OVERLAY_TOKEN        || config.overlay_token || 'change-me';
let   TIPS_URL    = process.env.N8N_TIPS_URL   || config.n8n_tips_url    || '';
let   WEBHOOK_URL = process.env.N8N_WEBHOOK_URL|| config.n8n_webhook_url  || '';

// RUNTIME_DIR: writable directory for PID files, session state, and config.
// In Electron mode, set to ~/Library/Application Support/SalesOverlay by main.js.
// In CLI mode, falls back to the script directory.
const RUNTIME_DIR = process.env.OVERLAY_RUNTIME_DIR || BASE_DIR;

// Update support
const GITHUB_REPO = process.env.GITHUB_REPO    || config.github_repo    || '';
const APP_PATH    = process.env.SALES_APP_PATH || '';

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

  if (req.url === "/config" && req.method === "GET") {
    const isPlaceholder = (v) => !v || v.includes('DEIN') || v.includes('example');
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      token:       TOKEN,
      tipsUrl:     TIPS_URL,
      webhookUrl:  WEBHOOK_URL,
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

        const cfgFile = path.join(RUNTIME_DIR, 'config.json');
        let existing = {};
        try { existing = JSON.parse(fs.readFileSync(cfgFile, 'utf8')); } catch (_) {}
        fs.writeFileSync(cfgFile, JSON.stringify({
          ...existing,
          n8n_webhook_url: data.webhookUrl,
          n8n_tips_url:    data.tipsUrl,
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
        try {
          const dl = await fetch(downloadUrl, { signal: AbortSignal.timeout(120000) });
          if (!dl.ok) throw new Error(`Download fehlgeschlagen: ${dl.status}`);
          const buf = await dl.arrayBuffer();
          fs.writeFileSync(zipPath, Buffer.from(buf));

          execSync(`rm -rf "${tmpDir}" && unzip -o "${zipPath}" -d "${tmpDir}"`, { stdio: 'ignore' });
          const newApp = execSync(
            `find "${tmpDir}" -name "*.app" -maxdepth 3 | head -1`, { encoding: 'utf8' }
          ).trim();
          if (!newApp) throw new Error('Keine .app im ZIP gefunden');

          const script = [
            '#!/bin/bash',
            'sleep 3',
            `rm -rf "${APP_PATH}"`,
            `cp -R "${newApp}" "${APP_PATH}"`,
            `rm -rf "${tmpDir}" "${zipPath}"`,
            `xattr -dr com.apple.quarantine "${APP_PATH}" 2>/dev/null || true`,
            `codesign --force --deep --sign - "${APP_PATH}" 2>/dev/null || true`,
            `open "${APP_PATH}"`,
          ].join('\n');
          fs.writeFileSync(scriptPath, script, { mode: 0o755 });

          // Signal main.js to quit + run update script
          fs.writeFileSync(
            path.join(RUNTIME_DIR, 'update_pending.json'),
            JSON.stringify({ updateScript: scriptPath })
          );
        } catch (e) {
          console.error('Update-Download fehlgeschlagen:', e.message);
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
    const pending = fs.existsSync(path.join(RUNTIME_DIR, 'update_pending.json'));
    const errFile = path.join(RUNTIME_DIR, 'update_error.json');
    const errored = fs.existsSync(errFile);
    let errMsg = null;
    if (errored) {
      try { errMsg = JSON.parse(fs.readFileSync(errFile, 'utf8')).error; } catch (_) {}
      try { fs.unlinkSync(errFile); } catch (_) {}
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ pending, error: errMsg }));
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: false, error: "not_found" }));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`✅  Overlay Control → http://127.0.0.1:${PORT}`);
  console.log(`    Token:  ${TOKEN}`);
  console.log(`    Script: ${SCRIPT}`);
});
