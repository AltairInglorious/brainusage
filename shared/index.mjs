// Public surface of the platform-agnostic core.
// Consumed by the KDE plasmoid via a single bundled file (see scripts/kde/pack.sh).
// The GNOME extension imports the individual modules directly (GJS loads ESM natively).

export {createScheduler, DEFAULT_POLL_INTERVAL_MS} from './core/scheduler.js';
export {computeSummary} from './core/aggregate.js';
export {createBackoffManager} from './core/backoff.js';
export {
    createProviderState,
    applyProviderResult,
    snapshotProviderState,
    PROVIDER_STATE_CODES,
} from './core/state.js';
export {createThresholdNotifier} from './core/notifications.js';
export {normalizeClaudeUsage, normalizeCodexUsage} from './core/normalize.js';
export {createClaudeProvider, claudeProviderConfig} from './providers/claude.js';
export {createCodexProvider, codexProviderConfig} from './providers/codex.js';
export {
    buildUsageViewModel,
    getDotColor,
    formatRelativeTime,
    PANEL_LABEL_MODES,
} from './ui/render.js';
