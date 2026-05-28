#!/usr/bin/env bash
# Build a KDE plasmoid variant's contents/code/: bundle the shared core into a
# single ES module and copy the network runtime.
#
# The bundle is transpiled to ES2015 because the QML JavaScript engine (V4) on
# Qt 5.15 / Plasma 5 does not support optional chaining (?.), nullish
# coalescing (??), object spread, or async/await. ES2015 runs on both Plasma 5
# (Qt5) and Plasma 6 (Qt6).
#
# Usage: bundle-kde.sh <variant-dir>   (e.g. kde/plasma6)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VARIANT_DIR="${1:?usage: bundle-kde.sh <variant-dir>}"
SRC_DIR="$ROOT_DIR/kde/shared/code"
CODE_DIR="$ROOT_DIR/$VARIANT_DIR/contents/code"

if ! command -v bunx >/dev/null 2>&1; then
  printf 'Error: bunx (bun) is required to bundle the KDE core.\n' >&2
  exit 1
fi

mkdir -p "$CODE_DIR"

bunx esbuild "$SRC_DIR/app.mjs" \
  --bundle \
  --format=esm \
  --target=es2015 \
  --outfile="$CODE_DIR/brainusage-app.mjs"

cp "$SRC_DIR/runtime.js" "$CODE_DIR/runtime.js"

printf 'Bundled KDE core -> %s\n' "$CODE_DIR"
