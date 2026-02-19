#!/usr/bin/env bash
# Erstellt SalesOverlay.app.zip für die Weitergabe / GitHub Releases
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION=$(node -e "console.log(require('./package.json').version)" 2>/dev/null || echo "1.0.0")
OUTDIR="dist/release"
OUTFILE="${OUTDIR}/SalesOverlay.app.zip"
APP_PATH="dist/mac-arm64/SalesOverlay.app"

echo ""
echo "📦  Sales Overlay Release v${VERSION}"
echo ""

# ── 1. App bauen ──────────────────────────────────────────────────────────────
echo "🔨  Baue SalesOverlay.app…"
npm run build 2>&1 | grep -v "^$" | tail -5
echo "✅  App gebaut"

# ── 2. Release-Ordner vorbereiten ────────────────────────────────────────────
mkdir -p "$OUTDIR"
rm -f "$OUTFILE" "${OUTFILE}.sha256"

# ── 3. ZIP erstellen ──────────────────────────────────────────────────────────
echo "🗜️   Erstelle ZIP…"
cd dist/mac-arm64
zip -r --symlinks "../../${OUTFILE}" SalesOverlay.app -x "*.DS_Store" > /dev/null
cd ../..
echo "✅  ZIP erstellt: ${OUTFILE}"

# ── 4. SHA256 checksum ────────────────────────────────────────────────────────
shasum -a 256 "$OUTFILE" > "${OUTFILE}.sha256"
echo "✅  SHA256: $(cat "${OUTFILE}.sha256" | awk '{print $1}')"

# ── 5. Größe anzeigen ────────────────────────────────────────────────────────
SIZE=$(du -sh "$OUTFILE" | cut -f1)
echo ""
echo "══════════════════════════════════════════"
echo "  Release fertig: ${OUTFILE} (${SIZE})"
echo "══════════════════════════════════════════"
echo ""
echo "Jetzt auf GitHub hochladen:"
echo "  gh release create v${VERSION} ${OUTFILE} --title \"v${VERSION}\" --notes \"Release v${VERSION}\""
echo ""
echo "Oder manuell:"
echo "  Gehe zu GitHub → Releases → New Release → Asset hochladen"
echo ""
echo "Asset-Name im Release MUSS sein: SalesOverlay.app.zip"
echo ""
