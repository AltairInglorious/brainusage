#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EXTENSION_DIR="$ROOT_DIR/extension"
ZIP_NAME="usage-limits@example.shell-extension.zip"
ZIP_PATH="$ROOT_DIR/$ZIP_NAME"
EVIDENCE_PATH="$ROOT_DIR/.sisyphus/evidence/task-7-pack.txt"

if ! command -v gnome-extensions >/dev/null 2>&1; then
  printf 'Error: gnome-extensions is not installed or not on PATH.\n' >&2
  exit 1
fi

mkdir -p "$ROOT_DIR/.sisyphus/evidence"

gnome-extensions pack "$EXTENSION_DIR" \
  --force \
  --schema=schemas/org.gnome.shell.extensions.usage-limits.gschema.xml \
  --extra-source=lib \
  --out-dir "$ROOT_DIR" 2>&1 | tee "$EVIDENCE_PATH"

if [[ -f "$ZIP_PATH" ]]; then
  printf 'Packed: %s\n' "$ZIP_PATH"
else
  printf 'Error: expected archive not found at %s\n' "$ZIP_PATH" >&2
  exit 1
fi
