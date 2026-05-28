// KDE plasmoid application wiring. Imports the shared core (bundled by
// scripts/kde/pack.sh via `bun build`, which inlines ../../../shared/index.mjs)
// and exposes a tiny createApp() facade that QML drives. All scheduling,
// OAuth, normalization and view-model logic lives in the shared core; this
// file only adapts it to platform primitives injected from QML.

import {
    createScheduler,
    createClaudeProvider,
    createCodexProvider,
    createThresholdNotifier,
    buildUsageViewModel,
    DEFAULT_POLL_INTERVAL_MS,
    PANEL_LABEL_MODES,
} from '../../../shared/index.mjs';

// No-op timer functions. The plasmoid drives polling from a QML Timer calling
// refresh(); we never call scheduler.start(). These stubs are passed so the
// scheduler factory never references globalThis.setInterval — which does not
// exist on Qt 5.15's QML engine and would throw on evaluation.
function noopSetInterval() { return 0; }
function noopClearInterval() {}

const MODE_LABELS = {
    'min': 'All (minimum)',
    'claude-session': 'Claude Session',
    'claude-weekly': 'Claude Weekly',
    'codex-session': 'Codex Session',
    'codex-weekly': 'Codex Weekly',
};

export {PANEL_LABEL_MODES, DEFAULT_POLL_INTERVAL_MS};

export function modeLabel(mode) {
    return MODE_LABELS[mode] || mode;
}

// deps: { fetchImpl, readTextFile, homeDir, notify, onUpdate }
//  - fetchImpl/readTextFile: from runtime.js (XHR-backed)
//  - homeDir: resolved in QML via StandardPaths (no trailing slash)
//  - notify(title, body): triggers a QML Notification
//  - onUpdate(summary): called whenever provider state changes (re-render hook)
export function createApp(deps) {
    deps = deps || {};
    const fetchImpl = deps.fetchImpl;
    const readTextFile = deps.readTextFile;
    const homeDir = deps.homeDir || null;
    const notify = typeof deps.notify === 'function' ? deps.notify : function () {};
    const onUpdate = typeof deps.onUpdate === 'function' ? deps.onUpdate : function () {};

    const claude = createClaudeProvider({fetch: fetchImpl, readTextFile, homeDir});
    const codex = createCodexProvider({fetch: fetchImpl, readTextFile, homeDir});
    const notifier = createThresholdNotifier({notifyFn: notify});

    let lastSummary = null;

    const scheduler = createScheduler({
        providers: {claude, codex},
        setIntervalFn: noopSetInterval,
        clearIntervalFn: noopClearInterval,
        onUpdate: function (summary) {
            lastSummary = summary;
            notifier.evaluate(summary);
            onUpdate(summary);
        },
    });

    return {
        refresh: function () { return scheduler.refresh(); },
        getSummary: function () { return scheduler.getSummary(); },
        // Build the render view-model for the current summary at the current time.
        viewModel: function (panelLabelMode) {
            return buildUsageViewModel(lastSummary, {
                now: Date.now(),
                pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
                panelLabelMode: panelLabelMode || 'min',
            });
        },
    };
}
