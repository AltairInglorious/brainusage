# KDE Plasma support — design

Date: 2026-05-28
Status: Approved (forks chosen by user; layout decided for low risk to the released GNOME extension)

## Goal

Extend brainusage so AI usage limits (Claude + Codex) can be monitored on **both
GNOME Shell and KDE Plasma**, by adding a Plasma widget (plasmoid) alongside the
existing GNOME Shell extension, and splitting packaging/installation into **two
installers — one for GNOME, one for KDE**.

## Decisions (user-confirmed forks)

1. **Target Plasma versions:** both Plasma 5 and Plasma 6.
2. **Code sharing:** a single shared core consumed by both platforms.
3. **Feature parity:** KDE widget reaches full parity with the GNOME extension
   (panel percentage, popup with Codex + Claude session/weekly progress bars,
   threshold notifications, panel-label-mode switch).

## Why this is feasible

The hard logic is already platform-agnostic ECMAScript driven by dependency
injection. Today these modules live under `extension/lib/`:

- `core/` — scheduler, aggregate, state, backoff, notifications, normalize
- `providers/` — claude, codex (take `fetch` + `readTextFile` as DI)
- `ui/render.js` — pure function: summary → view-model strings

They use only standard JS (Promise, Map, Date, JSON, URLSearchParams, and an
injected `fetch`/`readTextFile`/`setInterval`). The only GJS-coupled code is
`extension/extension.js` (St/Clutter/GObject/PanelMenu) and
`extension/lib/runtime/{fetch,fs}.js` (Soup/Gio). So a KDE port reuses the core
verbatim and only re-implements the thin platform layer (runtime + UI).

## Repository layout

The canonical shared core is extracted to a neutral top-level `shared/`. The
existing GNOME package keeps its home at `extension/` (renaming it would add
regression risk to a released, locally-untestable extension). KDE is added
under `kde/`.

```
brainusage/
  shared/                         # CANONICAL platform-agnostic core (ESM, DI) — single source of truth
    core/{scheduler,aggregate,state,backoff,notifications,normalize}.js
    providers/{claude,codex}.js
    ui/render.js
    index.mjs                     # re-exports the public surface for KDE bundling
  extension/                      # GNOME Shell extension (home unchanged)
    extension.js  metadata.json  stylesheet.css  schemas/
    lib/runtime/{fetch,fs}.js     # Soup/Gio adapters (GNOME-only)
    lib/{core,providers,ui}/      # VENDORED from shared/ at pack time (gitignored)
  kde/
    plasma6/  metadata.json  contents/{ui,config,code}/
    plasma5/  metadata.json  contents/{ui,config,code}/
  test/unit/...                   # bun tests against shared/
  scripts/
    build/sync-core.sh            # shared/ -> extension/lib (copy) ; shared/ -> bundle -> kde code/
    gnome/{pack,install,enable,disable}.sh
    kde/{pack,install}.sh         # auto-detects running Plasma 5 vs 6
  docs/superpowers/specs/...
```

`extension/extension.js` keeps importing `./lib/core/...`, `./lib/providers/...`,
`./lib/ui/...`, `./lib/runtime/...` unchanged — the sync step populates
`extension/lib/{core,providers,ui}` before packing. Test imports move from
`../../extension/lib/...` to `../../shared/...`.

## Shared core and build

`shared/` is the current `extension/lib/{core,providers,ui}` relocated verbatim
(no logic changes). A new `shared/index.mjs` re-exports the surface KDE needs
(`createScheduler`, `createClaudeProvider`, `createCodexProvider`,
`createThresholdNotifier`, `buildUsageViewModel`, `PANEL_LABEL_MODES`,
`DEFAULT_POLL_INTERVAL_MS`).

- **GNOME build:** `sync-core.sh` copies `shared/{core,providers,ui}` into
  `extension/lib/`. GJS (Shell 45+) loads ESM natively, so no bundling.
- **KDE build:** `bun build shared/index.mjs --bundle --format=esm` produces one
  `contents/code/brainusage-core.mjs` per plasmoid variant. QML imports it as
  `import "../code/brainusage-core.mjs" as Core`. A single bundled file removes
  ESM-resolution differences between Qt5 (Plasma 5) and Qt6 (Plasma 6).
  (`bun` is already the test runner — no new dependency.)
- **Tests:** unchanged behavior; `bun test` runs against `shared/`. No network/FS.

## KDE runtime adapters (thin layer feeding the core's DI)

Implemented in QML/JS under each plasmoid's `contents/code/`:

- **`fetch`** → wrapper over QML `XMLHttpRequest` (GET/POST, request headers,
  body from `URLSearchParams.toString()`), returning the existing contract
  `{ok, status, json(), text()}`.
- **`readTextFile`** → `XMLHttpRequest` against a `file://` URL. Home directory
  resolved via `StandardPaths.HomeLocation` — the one version-specific spot
  (Qt5: `import Qt.labs.platform`; Qt6: `import QtCore`).
- **Polling** → not the scheduler's internal `setInterval`; a QML `Timer`
  (`interval: 180000; repeat: true`) calls `Core.refresh()`. The scheduler's DI
  exposes `refresh()` / `getSummary()`, so no global timers are needed.
- **Notifications** → core `createThresholdNotifier({ notifyFn })`; `notifyFn`
  triggers a QML `Notification` (`org.kde.notification`).

Each adapter maps its failures into the same `{ok:false, error:{code}}` shape the
Soup/Gio adapters produce, so core error states behave identically.

## KDE UI (full parity, two QML variants)

`render.js` already returns a ready view-model (panel label, per-window
`remainingPct`/`dotColor`/`remainingText`/`resetsInText`, per-service `warning`,
footer `lastUpdate`). QML stays thin layout:

- **Compact representation** (panel): percentage label — mirrors GNOME `_label`.
- **Full representation** (popup): two cards (Codex, Claude), each with Session
  and Weekly rows = progress bar + color (green/yellow/red via the same
  `getDotColor` thresholds) + "X% left" + "Resets in …"; per-service warning;
  footer "brainusage <ver>" + "Next update in …"; a Refresh action.
- **Plasma 6 variant** (`kde/plasma6/`): root `PlasmoidItem`,
  `org.kde.plasma.components`/`org.kde.kirigami`, `metadata.json` with
  `X-Plasma-API-Minimum-Version: "6.0"` and `KPackageStructure: Plasma/Applet`.
- **Plasma 5 variant** (`kde/plasma5/`): root `Item` with
  `Plasmoid.compactRepresentation`/`fullRepresentation`, `*.0` import versions,
  Plasma 5 metadata. Layout QML is duplicated across variants (it is thin); all
  logic lives in the shared bundled core.

## Settings

- KDE: `config/main.xml` (KConfigXT) with a `panelLabelMode` String entry
  (values from `PANEL_LABEL_MODES`, default `min`), surfaced by
  `config/config.qml`. Read via `plasmoid.configuration.panelLabelMode` — the
  KDE analog of the GNOME GSettings `panel-label-mode` key.

## Packaging and the two installers

- **GNOME installer:** `scripts/gnome/{pack,install,enable,disable}.sh` (moved
  from `scripts/dev/`). `pack.sh` first runs `sync-core.sh`, then
  `gnome-extensions pack … --extra-source=lib`. Artifact:
  `brainusage@altairinglorious.shell-extension.zip`. Behavior preserved 1:1.
- **KDE installer:** `scripts/kde/install.sh` detects the running Plasma major
  from `plasmashell --version` and installs the matching variant —
  Plasma 6 → `kpackagetool6 -t Plasma/Applet -i kde/plasma6`;
  Plasma 5 → `kpackagetool5`/`plasmapkg2 -i kde/plasma5`. `scripts/kde/pack.sh`
  bundles the core and produces `brainusage.plasmoid`.

This satisfies "two installers — one for GNOME, one for KDE."

## Error handling

Provider state machine (OK / PARTIAL_DATA / AUTH_EXPIRED / RATE_LIMITED /
NETWORK_ERROR / SCHEMA_CHANGED) and exponential backoff live entirely in the
shared core, so both platforms behave identically. The KDE UI renders the
`warning` field from the same view-model. Adapter-level failures (XHR error,
missing credentials file) map to the established error codes.

## Testing

- Shared-core unit tests (`bun test`) are unchanged except for import paths
  (`../../shared/...`); they must stay green.
- GNOME: cannot run `gnome-shell` locally; verification is limited to confirming
  `pack` produces a zip whose `lib/{core,providers,ui}` are present and that the
  relocated logic is byte-identical to the released version.
- KDE: manual verification on the local Plasma 5.24 machine — install via
  `scripts/kde/install.sh`, confirm panel label, popup parity, and a poll cycle.
  Plasma 6 layout verified by packaging validity (`kpackagetool6` not present
  locally) and structural review against KDE porting docs.

## Out of scope (YAGNI)

- No new providers or metrics beyond the existing Claude/Codex windows.
- No store.kde.org submission automation (manual `gh release` continues).
- No shared QML component library between the Plasma 5 and 6 variants — the
  layout is thin enough to duplicate; deduplicating later is optional.
```
