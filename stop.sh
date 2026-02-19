#!/usr/bin/env bash
cd "$(dirname "$0")"

echo "🛑  Stoppe Sales Overlay…"

# ── Bridges stoppen ───────────────────────────────────────────────────────────
if [ -f .bridge_child_pids ]; then
  while IFS= read -r pid; do
    [ -n "${pid:-}" ] && kill -TERM "$pid" 2>/dev/null || true
  done < .bridge_child_pids
fi

# ── Overlay-Control stoppen ───────────────────────────────────────────────────
if [ -f .overlay_control_pid ]; then
  kill -TERM "$(cat .overlay_control_pid)" 2>/dev/null || true
  rm -f .overlay_control_pid
fi

# ── Fallback: Pattern-basiertes Kill ─────────────────────────────────────────
pkill -TERM -f "bridge_mic\.mjs"    2>/dev/null || true
pkill -TERM -f "bridge_system\.mjs" 2>/dev/null || true
pkill -TERM -f "overlay-control\.mjs" 2>/dev/null || true
pkill -TERM -f "run_bridges\.sh"    2>/dev/null || true
pkill -TERM -f "ffmpeg.*avfoundation" 2>/dev/null || true

sleep 0.8

# ── Eskalation: SIGKILL ───────────────────────────────────────────────────────
pkill -KILL -f "bridge_mic\.mjs"    2>/dev/null || true
pkill -KILL -f "bridge_system\.mjs" 2>/dev/null || true
pkill -KILL -f "overlay-control\.mjs" 2>/dev/null || true
pkill -KILL -f "ffmpeg.*avfoundation" 2>/dev/null || true

# ── Aufräumen ─────────────────────────────────────────────────────────────────
rm -f .bridge_child_pids .overlay_runner_pids .overlay_control_pid

echo "✅  Gestoppt"
