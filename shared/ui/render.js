const VERSION = 'brainusage 0.0.1';

export const PANEL_LABEL_MODES = ['min', 'claude-session', 'claude-weekly', 'codex-session', 'codex-weekly'];

function getPanelLabelValue(summary, mode) {
    if (mode === 'min' || !mode)
        return summary?.minRemainingPct;

    const providers = summary?.providers;
    if (!providers)
        return undefined;

    switch (mode) {
        case 'claude-session': return providers.claude?.data?.sessionRemainingPct;
        case 'claude-weekly':  return providers.claude?.data?.weeklyRemainingPct;
        case 'codex-session':  return providers.codex?.data?.sessionRemainingPct;
        case 'codex-weekly':   return providers.codex?.data?.weeklyRemainingPct;
        default: return summary?.minRemainingPct;
    }
}

function formatPercent(value) {
    if (!Number.isFinite(value))
        return '--';

    return `${Math.round(value)}%`;
}

export function getDotColor(pct) {
    if (!Number.isFinite(pct))
        return 'red';

    if (pct >= 70)
        return 'green';

    if (pct >= 30)
        return 'yellow';

    return 'red';
}

export function formatRelativeTime(iso, now) {
    if (!iso)
        return '--';

    const target = new Date(iso).getTime();
    if (Number.isNaN(target))
        return '--';

    const diffMs = target - now;
    if (diffMs <= 0)
        return '--';

    const totalMinutes = Math.floor(diffMs / 60_000);
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    const minutes = totalMinutes % 60;

    const parts = [];
    if (days > 0)
        parts.push(`${days}d`);

    if (hours > 0)
        parts.push(`${hours}h`);

    if (minutes > 0 || parts.length === 0)
        parts.push(`${minutes}m`);

    return parts.join(' ');
}

function formatRemainingText(pct) {
    if (!Number.isFinite(pct))
        return '-- left';

    return `${Math.round(pct)}% left`;
}

function formatResetsIn(iso, now) {
    const rel = formatRelativeTime(iso, now);
    if (rel === '--')
        return '--';

    return `Resets in ${rel}`;
}

function toWarningText(providerLabel, code) {
    if (code === 'AUTH_EXPIRED')
        return `${providerLabel}: authentication expired`;

    if (code === 'PARTIAL_DATA')
        return `${providerLabel}: partial usage data`;

    if (code === 'NETWORK_ERROR')
        return `${providerLabel}: network error`;

    if (code === 'SCHEMA_CHANGED')
        return `${providerLabel}: schema changed`;

    return '';
}

function buildWindowViewModel(label, remainingPct, resetsAtIso, now) {
    return {
        label,
        remainingPct: Number.isFinite(remainingPct) ? Math.round(remainingPct) : 0,
        remainingText: formatRemainingText(remainingPct),
        resetsInText: formatResetsIn(resetsAtIso, now),
        dotColor: getDotColor(remainingPct),
    };
}

function buildServiceViewModel(name, providerData, providerCode, now) {
    const data = providerData ?? null;

    return {
        name,
        windows: [
            buildWindowViewModel(
                'Session',
                data?.sessionRemainingPct,
                data?.sessionResetsAtIso,
                now,
            ),
            buildWindowViewModel(
                'Weekly',
                data?.weeklyRemainingPct,
                data?.weeklyResetsAtIso,
                now,
            ),
        ],
        warning: toWarningText(name, providerCode),
    };
}

function formatNextUpdate(lastUpdatedAtIso, pollIntervalMs, now) {
    if (!lastUpdatedAtIso || !Number.isFinite(pollIntervalMs))
        return 'Next update in --';

    const lastMs = new Date(lastUpdatedAtIso).getTime();
    if (Number.isNaN(lastMs))
        return 'Next update in --';

    const nextMs = lastMs + pollIntervalMs;
    const diffMs = nextMs - now;

    if (diffMs <= 0)
        return 'Next update in 0m';

    const totalMinutes = Math.max(1, Math.ceil(diffMs / 60_000));
    return `Next update in ${totalMinutes}m`;
}

export function buildUsageViewModel(summary, deps = {}) {
    const now = deps.now ?? Date.now();
    const version = deps.version ?? VERSION;
    const pollIntervalMs = deps.pollIntervalMs ?? 180_000;
    const panelLabelMode = deps.panelLabelMode ?? 'min';

    const claude = summary?.providers?.claude ?? null;
    const codex = summary?.providers?.codex ?? null;

    return {
        panelLabel: formatPercent(getPanelLabelValue(summary, panelLabelMode)),
        services: [
            buildServiceViewModel('Codex', codex?.data, codex?.code, now),
            buildServiceViewModel('Claude', claude?.data, claude?.code, now),
        ],
        version,
        lastUpdate: formatNextUpdate(summary?.lastUpdatedAtIso, pollIntervalMs, now),
    };
}
