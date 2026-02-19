#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║     Sales Overlay — Ersteinrichtung      ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── 1. Node.js prüfen ────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "❌  Node.js nicht gefunden."
  echo "    Installiere Node.js (v18+) von: https://nodejs.org"
  echo ""
  exit 1
fi
NODE_VER=$(node --version)
echo "✅  Node.js $NODE_VER"

# ── 2. ffmpeg prüfen ─────────────────────────────────────────────────────────
if ! command -v ffmpeg &>/dev/null; then
  echo "❌  ffmpeg nicht gefunden."
  echo ""
  echo "    Installation (Homebrew):"
  echo "      /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
  echo "      brew install ffmpeg"
  echo ""
  exit 1
fi
echo "✅  ffmpeg gefunden"

# ── 3. config.json anlegen ───────────────────────────────────────────────────
if [ -f config.json ]; then
  echo "ℹ️   config.json existiert bereits (wird nicht überschrieben)"
else
  cp config.example.json config.json
  echo "✅  config.json aus Vorlage erstellt"
  echo ""
  echo "ℹ️   Die Webhook-URLs kannst du direkt in der App eintragen."
  echo ""
fi

# ── 4. npm install ───────────────────────────────────────────────────────────
echo "📦  Installiere Node.js Abhängigkeiten..."
npm install --silent
echo "✅  Abhängigkeiten installiert"

# ── 5. Scripts ausführbar machen ─────────────────────────────────────────────
chmod +x start.sh stop.sh run_bridges.sh 2>/dev/null || true
echo "✅  Scripts ausführbar gemacht"

# ── 6. macOS App bauen ───────────────────────────────────────────────────────
echo ""
echo "🔨  Baue macOS App (SalesOverlay.app)..."
if npm run build --silent 2>/dev/null; then
  APP_PATH="$(pwd)/dist/mac-arm64/SalesOverlay.app"
  echo "✅  SalesOverlay.app erstellt"
  echo ""
  echo "    Öffne im Finder: open dist/mac-arm64/"
  echo "    Lege die App ins Dock für schnellen Zugriff."
  echo ""
  echo "    Beim ersten Start die Webhook-URLs in der App eintragen."
else
  echo "⚠️  App-Build fehlgeschlagen — Terminal-Modus weiterhin verfügbar."
fi

echo ""
echo "═══════════════════════════════════════════"
echo "  Setup abgeschlossen!"
echo "═══════════════════════════════════════════"
echo ""
echo "Nächste Schritte:"
echo ""
echo "  1. Richte Audio MIDI Setup ein (SETUP.md):"
echo "       → Erstelle Gerät 'STT_MIC'    (dein Mikrofon)"
echo "       → Erstelle Gerät 'STT_SYSTEM' (System-Audio / BlackHole)"
echo "  2. App starten: Doppelklick auf dist/mac-arm64/SalesOverlay.app"
echo "     (Beim ersten Start Webhook-URLs in der App eintragen)"
echo ""
