# Brain Usage

GNOME Shell extension that tracks your AI usage limits for **Claude** (Anthropic) and **Codex/ChatGPT** (OpenAI) and displays remaining percentages in the top panel.

![GNOME Shell 45+](https://img.shields.io/badge/GNOME_Shell-45--49-blue)
![License: MIT](https://img.shields.io/badge/License-MIT-green)

## Features

- Session and weekly usage tracking for Claude and Codex
- Color-coded progress bars (green / yellow / red) based on remaining percentage
- Configurable panel label: show minimum across all, or a specific window
- Desktop notifications when usage drops below 20%
- Auto-refresh every 3 minutes with manual refresh option
- Dark theme with modern card-based popup design

## Prerequisites

- GNOME Shell 45 to 49
- Active [Claude](https://claude.ai) and/or [Codex](https://chatgpt.com) accounts with OAuth credentials on disk:
  - Claude: `~/.claude/.credentials.json`
  - Codex: `~/.codex/auth.json`

These credential files are created automatically when you sign in to the respective CLI tools ([Claude Code](https://docs.anthropic.com/en/docs/claude-code), [Codex CLI](https://github.com/openai/codex)).

## Installation

### From GitHub Releases (recommended)

1. Download the latest `brainusage@altairinglorious.shell-extension.zip` from [Releases](https://github.com/AltairInglorious/brainusage/releases/latest)

2. Install via terminal:
   ```bash
   gnome-extensions install --force brainusage@altairinglorious.shell-extension.zip
   ```

3. Restart GNOME Shell:
   - **Wayland**: log out and log back in
   - **X11**: press `Alt+F2`, type `r`, press Enter

4. Enable the extension:
   ```bash
   gnome-extensions enable brainusage@altairinglorious
   ```

### From source

```bash
git clone https://github.com/AltairInglorious/brainusage.git
cd brainusage
bash scripts/dev/pack.sh
bash scripts/dev/install.sh
# Restart GNOME Shell (see above), then:
bash scripts/dev/enable.sh
```

## Usage

Once enabled, a percentage indicator appears in the top panel. Click it to see a detailed breakdown:

- **Session** and **Weekly** usage for each provider
- Progress bars with color-coded status
- Time until each window resets
- Next automatic update countdown

### Panel display modes

Right-click or open the popup and select **Panel display** to choose what the top-bar label shows:

| Mode | Description |
|------|-------------|
| All (minimum) | Lowest percentage across all windows |
| Claude Session | Claude session usage only |
| Claude Weekly | Claude weekly usage only |
| Codex Session | Codex session usage only |
| Codex Weekly | Codex weekly usage only |

## Development

```bash
bun test                         # Run unit tests
bash scripts/dev/pack.sh         # Pack extension zip
bash scripts/dev/install.sh      # Install locally
journalctl --user -f /usr/bin/gnome-shell  # Live logs
```

## License

MIT
