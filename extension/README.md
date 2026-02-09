# usage-limits@example GNOME Extension

Minimal GNOME Shell extension scaffold for GNOME 45+ (tested target: GNOME 46).

## What this includes

- Top-bar indicator labeled `Usage`
- Clean enable/disable lifecycle
- Provider wiring for Claude and Codex usage data
- Scheduler polling every 3 minutes
- Notifications at 20% remaining for both session and weekly limits

## Local checks

From repository root:

```bash
bun install
bun test
gnome-extensions pack extension --force
```

Smoke pack script output is written to `.sisyphus/evidence/task-0-pack.txt`.

## Ubuntu GNOME local packaging workflow

Run all commands from repository root.

### Pack extension zip

```bash
bash scripts/dev/pack.sh
```

Expected artifact: `usage-limits@example.shell-extension.zip` in repo root.

### Install locally (user scope)

```bash
bash scripts/dev/install.sh
```

This installs/updates `usage-limits@example` in your local GNOME extensions directory.

### Enable extension

```bash
bash scripts/dev/enable.sh
```

### Disable extension

```bash
bash scripts/dev/disable.sh
```

### Troubleshooting GNOME Shell logs

```bash
journalctl --user -f /usr/bin/gnome-shell
```

Useful focused variant:

```bash
journalctl --user -f /usr/bin/gnome-shell | grep -E 'usage-limits@example|extension|JS ERROR'
```
