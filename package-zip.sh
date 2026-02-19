#!/usr/bin/env bash
# Erstellt das Distributions-ZIP für Team-Mitglieder
set -euo pipefail

cd "$(dirname "$0")"

VERSION=$(node -e "const p=require('./package.json');console.log(p.version)" 2>/dev/null || echo "1.0.0")
OUTFILE="sales-overlay-v${VERSION}.zip"

echo "📦  Erstelle $OUTFILE …"

# Dateien die ins ZIP gehören
FILES=(
  "main.js"
  "bridge_mic.mjs"
  "bridge_system.mjs"
  "detect_audio_devices.mjs"
  "overlay-control.mjs"
  "overlay.html"
  "run_bridges.sh"
  "start.sh"
  "stop.sh"
  "setup.sh"
  "config.example.json"
  "package.json"
  "SETUP.md"
)

# Validieren dass alle Dateien existieren
for f in "${FILES[@]}"; do
  if [ ! -f "$f" ]; then
    echo "❌  Fehlende Datei: $f"
    exit 1
  fi
done

# Altes ZIP entfernen
rm -f "$OUTFILE"

# ZIP erstellen (in Unterordner "sales-overlay/")
zip -j "$OUTFILE" "${FILES[@]}"

echo "✅  $OUTFILE erstellt"
echo ""
echo "Inhalt:"
unzip -l "$OUTFILE" | grep -v "^Archive" | grep -v "^\-\-" | awk '{print "   " $4}' | grep -v "^   $"
echo ""
echo "Für Entwickler: unzip sales-overlay-v*.zip && ./setup.sh"
echo ""
echo "ℹ️   Für Click-to-Run .app Verteilung: ./scripts/make-release.sh"
