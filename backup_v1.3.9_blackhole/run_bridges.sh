#!/usr/bin/env bash
set -euo pipefail

# Always run from this folder
cd "$(dirname "$0")"

# RUNTIME_DIR: writable directory for PID files and session state.
# In Electron mode, OVERLAY_RUNTIME_DIR is set by main.js (userData path).
# In CLI mode, falls back to the script directory (current dir after cd).
RUNTIME_DIR="${OVERLAY_RUNTIME_DIR:-$(pwd)}"
PIDFILE="${RUNTIME_DIR}/.bridge_child_pids"
CALL_ENV_FILE="${RUNTIME_DIR}/call_session.env"

# ── 1. Session laden oder neu erzeugen ───────────────────────────────────────
if [ -f "$CALL_ENV_FILE" ]; then
  # shellcheck disable=SC1090
  source "$CALL_ENV_FILE"
else
  export CALL_SESSION_ID="call-$(date +%s)"
  printf 'export CALL_SESSION_ID="%s"\n' "$CALL_SESSION_ID" > "$CALL_ENV_FILE"
fi
export CALL_SESSION_ID="$CALL_SESSION_ID"

# ── 2. Config aus config.json lesen (falls env var fehlt) ────────────────────
_readcfg() {
  # $1 = key, $2 = default
  node -e "const fs=require('fs');try{const c=JSON.parse(fs.readFileSync('./config.json'));process.stdout.write(String(c['$1']||'$2'))}catch(e){process.stdout.write('$2')}" 2>/dev/null || echo "$2"
}

if [ -f ./config.json ]; then
  # N8N_WEBHOOK_URL: env > config.json
  if [ -z "${N8N_WEBHOOK_URL:-}" ]; then
    CFG_WEBHOOK=$(_readcfg n8n_webhook_url "")
    if [ -n "$CFG_WEBHOOK" ]; then
      export N8N_WEBHOOK_URL="$CFG_WEBHOOK"
    fi
  fi

  # SEND_INTERVAL_MS: env > config.json > 20000
  if [ -z "${SEND_INTERVAL_MS:-}" ]; then
    export SEND_INTERVAL_MS=$(_readcfg send_interval_ms 20000)
  fi
fi

# ── 3. Validation ─────────────────────────────────────────────────────────────
if [ -z "${N8N_WEBHOOK_URL:-}" ]; then
  echo "❌  n8n_webhook_url fehlt." >&2
  exit 1
fi

# ── 4. Audio Devices: Auto-Detection erzwingen ────────────────────────────────
unset AUDIO_DEVICE_MIC    2>/dev/null || true
unset AUDIO_DEVICE_SYSTEM 2>/dev/null || true
unset AUDIO_DEVICE        2>/dev/null || true
export AUDIO_DEVICE_MIC=""
export AUDIO_DEVICE_SYSTEM=""
export AUDIO_DEVICE=""

export SEND_INTERVAL_MS="${SEND_INTERVAL_MS:-20000}"

echo "──────────────────────────────────────────────"
echo "🚀  Sales Overlay — Bridges starten"
echo "    Session:  $CALL_SESSION_ID"
echo "    Webhook:  $N8N_WEBHOOK_URL"
echo "    Interval: ${SEND_INTERVAL_MS}ms"
echo "    Devices:  werden automatisch erkannt"
echo "──────────────────────────────────────────────"

# ── 5. Cleanup trap ───────────────────────────────────────────────────────────
cleanup() {
  echo ""
  echo "🛑  Beende Bridges…"
  trap - SIGINT SIGTERM EXIT || true

  if [ -f "$PIDFILE" ]; then
    while IFS= read -r pid; do
      [ -n "${pid:-}" ] && kill -TERM "$pid" 2>/dev/null || true
    done < "$PIDFILE"
    rm -f "$PIDFILE" 2>/dev/null || true
  fi

  pkill -TERM -P $$                    2>/dev/null || true
  pkill -TERM -f "bridge_mic\.mjs"     2>/dev/null || true
  pkill -TERM -f "bridge_system\.mjs"  2>/dev/null || true
  pkill -TERM -f "ffmpeg.*avfoundation"2>/dev/null || true

  sleep 0.6

  if [ -f "$PIDFILE" ]; then
    while IFS= read -r pid; do
      [ -n "${pid:-}" ] && kill -KILL "$pid" 2>/dev/null || true
    done < "$PIDFILE"
  fi

  pkill -KILL -P $$                    2>/dev/null || true
  pkill -KILL -f "bridge_mic\.mjs"     2>/dev/null || true
  pkill -KILL -f "bridge_system\.mjs"  2>/dev/null || true
  pkill -KILL -f "ffmpeg.*avfoundation"2>/dev/null || true

  rm -f "$PIDFILE" 2>/dev/null || true
  exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# ── 6. PID-File neu erstellen ─────────────────────────────────────────────────
rm -f "$PIDFILE"

# ── 7. Mic-Bridge starten ─────────────────────────────────────────────────────
echo "🎙️  Starte Mic-Bridge (STT_MIC)…"
node bridge_mic.mjs &
MIC_PID=$!
echo "$MIC_PID" >> "$PIDFILE"
echo "✅  Mic-Bridge gestartet (PID: $MIC_PID)"

# ── 8. System-Bridge starten ──────────────────────────────────────────────────
echo "🔊  Starte System-Bridge (STT_SYSTEM)…"
node bridge_system.mjs &
SYS_PID=$!
echo "$SYS_PID" >> "$PIDFILE"
echo "✅  System-Bridge gestartet (PID: $SYS_PID)"

echo "──────────────────────────────────────────────"
echo "✅  Beide Bridges aktiv"
echo "    Stoppen: Overlay → [⏹ Stoppen]  oder  ./stop.sh"
echo "──────────────────────────────────────────────"

wait
