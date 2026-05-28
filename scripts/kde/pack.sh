#!/usr/bin/env bash
# Pack the KDE plasmoid variants into distributable .plasmoid archives.
# Produces brainusage-plasma5.plasmoid and brainusage-plasma6.plasmoid.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if ! command -v zip >/dev/null 2>&1; then
  printf 'Error: zip is required to build .plasmoid archives.\n' >&2
  exit 1
fi

pack_variant() {
  local variant="$1"   # plasma5 | plasma6
  local variant_dir="kde/$variant"
  local out="$ROOT_DIR/brainusage-$variant.plasmoid"

  bash "$ROOT_DIR/scripts/build/bundle-kde.sh" "$variant_dir"

  rm -f "$out"
  ( cd "$ROOT_DIR/$variant_dir" && zip -rq "$out" . -x '*.DS_Store' )
  printf 'Packed: %s\n' "$out"
}

pack_variant plasma5
pack_variant plasma6
