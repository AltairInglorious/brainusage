#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
UUID="usage-limits@example"
ZIP_PATH="$ROOT_DIR/${UUID}.shell-extension.zip"

if ! command -v gnome-extensions >/dev/null 2>&1; then
  printf 'Error: gnome-extensions is not installed or not on PATH.\n' >&2
  exit 1
fi

if [[ ! -f "$ZIP_PATH" ]]; then
  bash "$ROOT_DIR/scripts/dev/pack.sh"
fi

gnome-extensions install --force "$ZIP_PATH"
printf 'Installed: %s\n' "$UUID"
