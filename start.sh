#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

# ── Config prüfen ─────────────────────────────────────────────────────────────
if [ ! -f config.json ]; then
  echo "❌  config.json nicht gefunden."
  echo "    Führe zuerst ./setup.sh aus."
  exit 1
fi

# ── Config lesen via Node (plattformsicher, kein jq nötig) ───────────────────
_cfg() {
  node -e "const fs=require('fs');try{const c=JSON.parse(fs.readFileSync('./config.json'));process.stdout.write(String(c['$1']||'$2'))}catch(e){process.stdout.write('$2')}"
}

PORT=$(_cfg overlay_port 8787)
OVERLAY_TOKEN=$(_cfg overlay_token change-me)
N8N_URL=$(_cfg n8n_webhook_url "")
SEND_MS=$(_cfg send_interval_ms 20000)

export PORT
export OVERLAY_TOKEN
export N8N_WEBHOOK_URL="${N8N_WEBHOOK_URL:-$N8N_URL}"
export SEND_INTERVAL_MS="${SEND_INTERVAL_MS:-$SEND_MS}"

# ── Validierung ───────────────────────────────────────────────────────────────
if [ -z "${N8N_WEBHOOK_URL:-}" ]; then
  echo "❌  n8n_webhook_url in config.json fehlt. Bitte eintragen."
  exit 1
fi

# ── Overlay-Control prüfen ob schon läuft ────────────────────────────────────
if [ -f .overlay_control_pid ]; then
  EXISTING_PID=$(cat .overlay_control_pid 2>/dev/null || echo "")
  if [ -n "$EXISTING_PID" ] && kill -0 "$EXISTING_PID" 2>/dev/null; then
    echo "ℹ️   Overlay läuft bereits (PID $EXISTING_PID)"
    open "http://127.0.0.1:${PORT}"
    exit 0
  fi
  rm -f .overlay_control_pid
fi

echo ""
echo "🚀  Sales Overlay wird gestartet…"
echo "    Webhook: $N8N_WEBHOOK_URL"
echo "    Port:    $PORT"
echo ""

# ── Overlay-Control im Hintergrund starten ────────────────────────────────────
node overlay-control.mjs &
OVERLAY_PID=$!
echo $OVERLAY_PID > .overlay_control_pid

# Kurz warten bis der Server bereit ist
sleep 0.8

# ── Browser öffnen ────────────────────────────────────────────────────────────
open "http://127.0.0.1:${PORT}"

echo "✅  Overlay geöffnet: http://127.0.0.1:${PORT}"
echo ""
echo "    Zum Beenden: ./stop.sh"
echo ""
