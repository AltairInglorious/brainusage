#!/usr/bin/env bash
# Vendor the canonical shared/ core into the GNOME extension package tree.
#
# shared/{core,providers,ui} is the single source of truth. The GNOME extension
# loads ESM in place, so it needs physical copies under extension/lib/ at pack
# time. These copies are gitignored. (KDE bundles shared/ separately; see
# scripts/kde/pack.sh.)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SHARED_DIR="$ROOT_DIR/shared"
GNOME_LIB_DIR="$ROOT_DIR/extension/lib"

if [[ ! -d "$SHARED_DIR" ]]; then
  printf 'Error: shared/ not found at %s\n' "$SHARED_DIR" >&2
  exit 1
fi

for sub in core providers ui; do
  rm -rf "${GNOME_LIB_DIR:?}/$sub"
  mkdir -p "$GNOME_LIB_DIR/$sub"
  cp -R "$SHARED_DIR/$sub/." "$GNOME_LIB_DIR/$sub/"
done

printf 'Synced shared/{core,providers,ui} -> %s\n' "$GNOME_LIB_DIR"
