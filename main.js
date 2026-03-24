import { app, BrowserWindow, Menu, dialog, utilityProcess } from 'electron';
import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── Path helpers ───────────────────────────────────────────────────────────────
// SCRIPT_DIR = where overlay-control.mjs, bridge_*.mjs etc. live
// Dev:       project root (__dirname)
// Packaged:  SalesOverlay.app/Contents/Resources/app/
const SCRIPT_DIR  = __dirname;
const GITHUB_REPO = 'Viralhouse/sales-intelligence';

// Config lives in userData — same location whether packaged or dev
// ~/Library/Application Support/SalesOverlay/config.json
function getConfigPath(runtimeDir) {
  return path.join(runtimeDir, 'config.json');
}

// ── Find system Node.js ────────────────────────────────────────────────────────
function findNodeBin() {
  // 1. Bundled node binary (ships with the app — no system install needed)
  //    Test it first: on non-notarized builds Gatekeeper may kill it (exit signal)
  const bundled = path.join(SCRIPT_DIR, 'node_bundled');
  if (fs.existsSync(bundled)) {
    try {
      execSync(`"${bundled}" --version`, { timeout: 3000, stdio: 'ignore' });
      return bundled; // works fine
    } catch (_) {
      // Gatekeeper killed it or it crashed — fall through to system node
    }
  }

  // 2. System Node.js fallback (for dev mode or older installs)
  const candidates = [
    '/opt/homebrew/bin/node',
    '/usr/local/bin/node',
    '/usr/bin/node',
  ];
  try {
    const ver = fs.readFileSync(
      path.join(process.env.HOME, '.nvm/alias/default'), 'utf8'
    ).trim();
    candidates.unshift(path.join(process.env.HOME, `.nvm/versions/node/${ver}/bin/node`));
  } catch (_) {}
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  try { return execSync('which node', { encoding: 'utf8' }).trim(); } catch (_) {}
  return 'node';
}

function buildEnvPath() {
  const extra = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'];
  const existing = (process.env.PATH || '').split(':').filter(Boolean);
  return [...new Set([...extra, ...existing])].join(':');
}

// ── Load config (soft — missing values handled by overlay UI) ─────────────────
function loadConfig(runtimeDir) {
  const cfgPath = getConfigPath(runtimeDir);
  if (!fs.existsSync(cfgPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  } catch (_) {
    return {};
  }
}

// ── Current app path (for in-app updater) ─────────────────────────────────────
function getAppBundlePath() {
  if (!app.isPackaged) return '';
  // exe = .../SalesOverlay.app/Contents/MacOS/SalesOverlay
  // Go up 3 dirs → SalesOverlay.app
  return path.dirname(path.dirname(path.dirname(app.getPath('exe'))));
}

// ── State ─────────────────────────────────────────────────────────────────────
let win           = null;
let serverProcess = null;
let updatePoller  = null;

async function waitForServer(port, maxMs = 12000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/config`);
      if (r.ok) return true;
    } catch (_) {}
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
}

function createWindow(port) {
  win = new BrowserWindow({
    width: 420,
    height: 700,
    titleBarStyle: 'hiddenInset',
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  Menu.setApplicationMenu(null);
  win.loadURL(`http://127.0.0.1:${port}`);
  win.on('closed', () => { win = null; });
}

// ── Main ──────────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  const runtimeDir = app.getPath('userData');
  fs.mkdirSync(runtimeDir, { recursive: true });

  const cfg    = loadConfig(runtimeDir);
  const port   = Number(cfg.overlay_port || 8787);
  const token  = cfg.overlay_token       || 'change-me';

  const controlScript = path.join(SCRIPT_DIR, 'overlay-control.mjs');
  const appBundlePath = getAppBundlePath();

  // Remove Gatekeeper quarantine from bundled binaries (required for downloaded apps)
  if (app.isPackaged) {
    try {
      execSync(`xattr -rd com.apple.quarantine "${SCRIPT_DIR}" 2>/dev/null; true`, { stdio: 'ignore', shell: true, timeout: 5000 });
    } catch (_) {}
  }

  // Kill any stale process already listening on our port
  try { execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null; true`, { stdio: 'ignore', shell: true }); } catch (_) {}
  await new Promise(r => setTimeout(r, 300));

  const logPath = path.join(runtimeDir, 'startup.log');
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });
  const logLine = (s) => { logStream.write(`[${new Date().toISOString()}] ${s}\n`); };
  logLine(`Starting overlay-control via utilityProcess (Electron built-in Node)`);
  logLine(`Script: ${controlScript}`);

  let startupError = '';
  try {
    serverProcess = utilityProcess.fork(controlScript, [], {
      cwd: SCRIPT_DIR,
      env: {
        ...process.env,
        PATH:                buildEnvPath(),
        PORT:                String(port),
        OVERLAY_TOKEN:       token,
        N8N_WEBHOOK_URL:     cfg.n8n_webhook_url    || '',
        SEND_INTERVAL_MS:    String(cfg.send_interval_ms || 20000),
        OVERLAY_RUNTIME_DIR: runtimeDir,
        GITHUB_REPO:         GITHUB_REPO,
        SALES_APP_PATH:      appBundlePath,
        SUPABASE_URL:        cfg.supabase_url       || 'https://hhegrorcgcpvudsqcojq.supabase.co',
        SUPABASE_ANON_KEY:   cfg.supabase_anon_key  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhoZWdyb3JjZ2NwdnVkc3Fjb2pxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNDI4MDIsImV4cCI6MjA4OTkxODgwMn0.GsSVHgTCmAKovyOLgeCiC-LdqqUiBBjMiTyww6e77ag',
        SUPABASE_AUTH_MODE:  cfg.supabase_auth_mode || 'password',
      },
      stdio: 'pipe',
    });
  } catch (err) {
    startupError = err.message;
    logLine(`FORK ERROR: ${err.message}`);
  }

  if (serverProcess) {
    if (serverProcess.stderr) {
      serverProcess.stderr.on('data', d => {
        const msg = String(d);
        startupError += msg;
        logLine(`STDERR: ${msg.trim()}`);
      });
    }
    serverProcess.on('exit', code => {
      if (code !== 0) logLine(`Process exited with code: ${code}`);
    });
  }

  const ready = serverProcess ? await waitForServer(port) : false;
  if (!ready) {
    logLine('TIMEOUT: server did not start within 12s');
    logStream.end();
    const detail = startupError.trim()
      ? `\n\nFehler:\n${startupError.trim().slice(0, 600)}`
      : `\n\nLog: ${logPath}`;
    dialog.showErrorBox(
      'Sales Overlay – Start fehlgeschlagen',
      `Server-Start fehlgeschlagen (Timeout 12s).${detail}`
    );
    app.quit();
    return;
  }
  logLine('Server ready.');
  logStream.end();

  createWindow(port);

  // ── Poll for pending update (written by /do-update endpoint) ────────────────
  const flagPath = path.join(runtimeDir, 'update_pending.json');
  updatePoller = setInterval(() => {
    if (!fs.existsSync(flagPath)) return;
    clearInterval(updatePoller);
    try {
      const { updateScript } = JSON.parse(fs.readFileSync(flagPath, 'utf8'));
      fs.unlinkSync(flagPath);
      spawn('bash', [updateScript], { detached: true, stdio: 'ignore' }).unref();
    } catch (e) {
      console.error('Update-Start fehlgeschlagen:', e.message);
    }
    app.quit();
  }, 1000);
});

app.on('window-all-closed', () => app.quit());

app.on('will-quit', () => {
  if (updatePoller) clearInterval(updatePoller);
  if (serverProcess) {
    try { serverProcess.kill(); } catch (_) {}
  }
});
