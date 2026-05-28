# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Cross-desktop AI usage monitor for Claude (Anthropic) and Codex (OpenAI). Polls their OAuth APIs for usage limits and shows remaining percentages with threshold notifications. Ships as **two packages from one shared core**: a GNOME Shell 45–49 extension and a KDE Plasma 5/6 widget (plasmoid).

## Repository

- GitHub: https://github.com/AltairInglorious/brainusage
- `gh release create v<X.Y.Z> brainusage@altairinglorious.shell-extension.zip brainusage-plasma5.plasmoid brainusage-plasma6.plasmoid --title "v<X.Y.Z>" --notes "..."` — publish release

## Commands

```bash
bun test                        # Run all unit tests (against shared/)
bun test test/unit/scheduler.test.js  # Run a single test file

# GNOME
bash scripts/gnome/pack.sh      # sync shared/ -> extension/lib, pack .shell-extension.zip
bash scripts/gnome/install.sh   # Install extension locally (calls pack if needed)
bash scripts/gnome/enable.sh    # gnome-extensions enable brainusage@altairinglorious
bash scripts/gnome/disable.sh   # gnome-extensions disable brainusage@altairinglorious
journalctl --user -f /usr/bin/gnome-shell  # Live extension logs
# GOTCHA: install.sh skips pack if zip already exists — always run pack.sh first after code changes
# GOTCHA: gnome-extensions pack only includes top-level files — lib/ requires --extra-source=lib in pack.sh

# KDE
bash scripts/kde/pack.sh        # Build both brainusage-plasma{5,6}.plasmoid
bash scripts/kde/install.sh     # Detect Plasma 5/6 and install the matching variant
journalctl --user -f plasmashell  # Live widget logs
```

After changing GNOME source, re-install and re-login (Wayland) or `Alt+F2 → r` (X11). After changing KDE source, re-run `scripts/kde/install.sh` and restart plasmashell (`kquitapp5/6 plasmashell && kstart5/6 plasmashell`).

## Architecture

The platform-agnostic core lives in `shared/` (single source of truth, pure ESM + DI). Each platform adds a thin adapter layer and consumes the core at build time.

```
shared/core/scheduler.js → Polls providers on 180s interval, serial queue per provider
shared/core/aggregate.js → Computes minRemainingPct across all providers
shared/core/state.js     → Per-provider state machine (OK/PARTIAL_DATA/AUTH_EXPIRED/RATE_LIMITED/NETWORK_ERROR/SCHEMA_CHANGED)
shared/core/backoff.js   → Exponential backoff (30s initial, 15m cap, on 2+ consecutive network errors or 429)
shared/core/notifications.js → Fires notifyFn() when usage crosses below 20%, deduplicates per window
shared/core/normalize.js → Extracts remaining% from Claude/Codex API response shapes
shared/core/http.js      → encodeForm(): form-urlencoded body string (no URLSearchParams; see KDE notes)
shared/providers/claude.js → OAuth refresh + usage fetch against api.anthropic.com
shared/providers/codex.js  → OAuth refresh + usage fetch against chatgpt.com
shared/ui/render.js      → Pure function: summary → UI view model strings
shared/index.mjs         → Re-export surface for KDE bundling

extension/extension.js   → GNOME lifecycle, wires DI, GObject/St UI
extension/lib/runtime/fetch.js → Soup 3.0 async HTTP wrapped in Promises (GNOME)
extension/lib/runtime/fs.js    → Gio async file read wrapped in Promises (GNOME)
extension/lib/{core,providers,ui}/ → VENDORED copy of shared/ at pack time (gitignored)

kde/shared/code/runtime.js → XHR network fetch (classic QML JS library)
kde/shared/code/app.mjs    → createApp(): wires shared core to injected platform deps
kde/plasma6/  → Plasma 6 plasmoid (PlasmoidItem root, plasma5support DataSource)
kde/plasma5/  → Plasma 5 plasmoid (Item root + Plasmoid.compact/fullRepresentation)
kde/plasma{5,6}/contents/code/ → bundled brainusage-app.mjs + runtime.js (built, gitignored)
```

## KDE notes (Plasma 5/6)

- **ES2015 transpile is mandatory.** Qt 5.15's QML engine (V4, Plasma 5) does NOT support `?.`, `??`, object spread, or async/await. `scripts/build/bundle-kde.sh` bundles `kde/shared/code/app.mjs` + `shared/` via `bunx esbuild --target=es2015`. The same bundle runs on Plasma 6 (Qt6).
- **No `globalThis` / `URLSearchParams`** in the QML engine. The shared core avoids both: `shared/core/http.js#encodeForm` builds form bodies as strings, and `app.mjs` passes no-op `setIntervalFn`/`clearIntervalFn` so the scheduler factory never touches `globalThis.setInterval`.
- **Credentials are read via the Plasma "executable" DataSource** (`ExecReader.qml`: `cat <path>` / `printenv HOME`), NOT file:// XHR — local-file XHR is deprecated and disabled by default on newer Qt. Plasma 5 uses `org.kde.plasma.core` DataSource; Plasma 6 uses `org.kde.plasma.plasma5support`.
- **Polling** is driven by a QML `Timer` calling `app.refresh()` (the core's `start()`/`setInterval` is unused).
- **Notifications** are created lazily via `Qt.createQmlObject` with try/catch so a missing `org.kde.notification` module degrades gracefully.
- **Two QML variants** because Plasma 5/6 imports and root types differ (`Item`+`Plasmoid.*Representation` vs `PlasmoidItem`); layout QML is intentionally duplicated, all logic is in the shared core.

## GSettings

- Schema XML lives in `extension/schemas/`, compiled automatically by `gnome-extensions pack --schema=...`
- `this.getSettings()` in Extension subclass loads schema by `settings-schema` from `metadata.json`
- After adding/changing schema: must repack, reinstall, and re-login

## Key Patterns

- **St.Widget sizing in popups**: `widget.get_width()` returns 0 when popup is closed. Store data on widget (e.g. `fill._remainingPct`) and use `notify::allocation` to recalculate when popup opens.
- **Dependency injection everywhere**: All modules export factory functions (`createScheduler`, `createClaudeProvider`, etc.) that receive deps as options. This is how tests work without GJS runtime.
- **Provider interface contract**: `{getUsage(): Promise<{ok, data?, error?}>}`. Adding a new provider means implementing this shape and registering in scheduler.
- **GObject.registerClass()**: Required for any class extending PanelMenu.Button or other GObject types. Use `_init()` not `constructor()`, `super._init()` not `super()`.
- **Result type**: `{ok: boolean, data?: {...}, error?: {code: string, message: string}}` — used by providers, state, and scheduler.
- **Serial request queue**: One in-flight request per provider via Promise chain — never parallel requests to same API.

## Testing

Tests use `bun:test` (describe/test/expect + vi for fake timers). Tests mock fetch and readTextFile via DI — no network or filesystem calls. Scheduler tests use `vi.useFakeTimers()` and `vi.advanceTimersByTime()` to control polling. Provider tests use deferred promises to simulate async resolution order.

## Credentials

- Claude: `~/.claude/.credentials.json` → `claudeAiOauth.{accessToken, refreshToken, expiresAt}`
- Codex: `~/.codex/auth.json` → `tokens.{access_token, refresh_token, account_id}`

Both providers support multiple field naming conventions (camelCase and snake_case).
