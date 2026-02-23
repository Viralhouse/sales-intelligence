#!/usr/bin/env bash
# Downloads Node.js LTS arm64 + x64 binaries and creates a universal binary.
# Output: ./node_bundled (universal fat binary, runs on Apple Silicon + Intel)
# Cached: skips download if node_bundled already exists with correct version.
set -euo pipefail

cd "$(dirname "$0")/.."

NODE_VERSION="v24.13.1"
OUT="./node_bundled"
VERSION_STAMP=".node_bundled_version"

# Skip if already built with same version
if [ -f "$OUT" ] && [ -f "$VERSION_STAMP" ] && [ "$(cat "$VERSION_STAMP")" = "$NODE_VERSION" ]; then
  echo "✅ node_bundled already at ${NODE_VERSION}, skipping download"
  exit 0
fi

TMPDIR_CUSTOM="$(mktemp -d)"
cleanup() { rm -rf "$TMPDIR_CUSTOM"; }
trap cleanup EXIT

echo "📦 Bundling Node.js ${NODE_VERSION} (universal arm64 + x64)…"

ARM64_URL="https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-darwin-arm64.tar.gz"
X64_URL="https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-darwin-x64.tar.gz"

echo "⬇️  Downloading arm64…"
curl -# -L "$ARM64_URL" | tar -xz -C "$TMPDIR_CUSTOM" --strip-components=2 "node-${NODE_VERSION}-darwin-arm64/bin/node"
mv "$TMPDIR_CUSTOM/node" "$TMPDIR_CUSTOM/node-arm64"

echo "⬇️  Downloading x64…"
curl -# -L "$X64_URL" | tar -xz -C "$TMPDIR_CUSTOM" --strip-components=2 "node-${NODE_VERSION}-darwin-x64/bin/node"
mv "$TMPDIR_CUSTOM/node" "$TMPDIR_CUSTOM/node-x64"

echo "🔗 Creating universal binary with lipo…"
lipo -create -output "$OUT" "$TMPDIR_CUSTOM/node-arm64" "$TMPDIR_CUSTOM/node-x64"
chmod +x "$OUT"

echo "✂️  Stripping debug symbols…"
strip "$OUT" 2>/dev/null || true

echo "$NODE_VERSION" > "$VERSION_STAMP"
echo "✅ node_bundled ready ($(du -sh "$OUT" | cut -f1)), architectures: $(lipo -archs "$OUT")"
