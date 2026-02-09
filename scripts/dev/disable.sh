#!/usr/bin/env bash
set -euo pipefail

UUID="usage-limits@example"

if ! command -v gnome-extensions >/dev/null 2>&1; then
  printf 'Error: gnome-extensions is not installed or not on PATH.\n' >&2
  exit 1
fi

gnome-extensions disable "$UUID"
printf 'Disabled: %s\n' "$UUID"
