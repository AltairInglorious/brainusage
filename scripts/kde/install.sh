#!/usr/bin/env bash
# Install the Brain Usage plasmoid for the running KDE Plasma version.
# Detects Plasma 5 vs 6 and uses the matching package + packaging tool.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APPLET_ID="org.altairinglorious.brainusage"

if ! command -v plasmashell >/dev/null 2>&1; then
  printf 'Error: plasmashell not found — is this a KDE Plasma session?\n' >&2
  exit 1
fi

VERSION_LINE="$(plasmashell --version 2>/dev/null || true)"
MAJOR="$(printf '%s' "$VERSION_LINE" | grep -oE '[0-9]+' | head -n1)"

case "$MAJOR" in
  6)
    VARIANT="plasma6"
    TOOL="kpackagetool6"
    ;;
  5)
    VARIANT="plasma5"
    TOOL="kpackagetool5"
    ;;
  *)
    printf 'Error: unsupported or undetected Plasma version: %s\n' "$VERSION_LINE" >&2
    exit 1
    ;;
esac

if ! command -v "$TOOL" >/dev/null 2>&1; then
  if [ "$MAJOR" = "5" ] && command -v plasmapkg2 >/dev/null 2>&1; then
    TOOL="plasmapkg2"
  else
    printf 'Error: %s not found — cannot install the Plasma %s widget.\n' "$TOOL" "$MAJOR" >&2
    exit 1
  fi
fi

PKG_DIR="$ROOT_DIR/kde/$VARIANT"

# Build the bundled core for this variant before installing.
bash "$ROOT_DIR/scripts/build/bundle-kde.sh" "kde/$VARIANT"

printf 'Installing %s (Plasma %s) via %s...\n' "$APPLET_ID" "$MAJOR" "$TOOL"

if [ "$TOOL" = "plasmapkg2" ]; then
  plasmapkg2 --upgrade "$PKG_DIR" 2>/dev/null || plasmapkg2 --install "$PKG_DIR"
else
  "$TOOL" --type Plasma/Applet --upgrade "$PKG_DIR" 2>/dev/null \
    || "$TOOL" --type Plasma/Applet --install "$PKG_DIR"
fi

printf 'Installed %s.\n' "$APPLET_ID"
printf 'Add it from the widget chooser (right-click panel/desktop -> Add Widgets -> "Brain Usage").\n'
printf 'If it was already on the panel, restart Plasma: kquitapp%s plasmashell && kstart%s plasmashell\n' "$MAJOR" "$MAJOR"
