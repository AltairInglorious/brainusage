const VERSION = 'brainusage 0.0.1';

const PANEL_MODE_CONFIG = [
    {
        key: 'codex-session',
        providerKey: 'codex',
        providerName: 'Codex',
        windowKey: 'session',
        panelShortLabel: 's',
        serviceLabel: 'Session',
        remainingKey: 'sessionRemainingPct',
        usedKey: 'sessionUsedPct',
    },
    {
        key: 'codex-weekly',
        providerKey: 'codex',
        providerName: 'Codex',
        windowKey: 'weekly',
        panelShortLabel: 'w',
        serviceLabel: 'Week',
        remainingKey: 'weeklyRemainingPct',
        usedKey: 'weeklyUsedPct',
    },
    {
        key: 'claude-session',
        providerKey: 'claude',
        providerName: 'Claude',
        windowKey: 'session',
        panelShortLabel: 's',
        serviceLabel: 'Session',
        remainingKey: 'sessionRemainingPct',
        usedKey: 'sessionUsedPct',
    },
    {
        key: 'claude-weekly',
        providerKey: 'claude',
        providerName: 'Claude',
        windowKey: 'weekly',
        panelShortLabel: 'w',
        serviceLabel: 'Week',
        remainingKey: 'weeklyRemainingPct',
        usedKey: 'weeklyUsedPct',
    },
];

const PANEL_MODE_CONFIG_MAP = new Map(
    PANEL_MODE_CONFIG.map((config) => [config.key, config]),
);

export const PANEL_DISPLAY_MODES = PANEL_MODE_CONFIG.map((config) => config.key);
export const DEFAULT_PANEL_DISPLAY_MODES = [...PANEL_DISPLAY_MODES];
export const PANEL_PERCENT_MODES = ['left', 'used'];
export const PANEL_LABEL_MODES = ['compact', 'expanded'];

function getPanelMetricFromConfig(summary, config, percentMode) {
    const data = summary?.providers?.[config.providerKey]?.data;
    const percentValue = percentMode === 'used'
        ? data?.[config.usedKey]
        : data?.[config.remainingKey];

    return {
        key: config.key,
        providerKey: config.providerKey,
        providerName: config.providerName,
        windowKey: config.windowKey,
        windowShortLabel: config.panelShortLabel,
        serviceLabel: config.serviceLabel,
        remainingPct: data?.[config.remainingKey],
        usedPct: data?.[config.usedKey],
        percentText: formatPercent(percentValue),
    };
}

function normalizePanelDisplayModes(modes) {
    if (!Array.isArray(modes))
        return [...DEFAULT_PANEL_DISPLAY_MODES];

    const uniqueModes = new Set(modes);
    const validModes = PANEL_DISPLAY_MODES.filter((mode) => uniqueModes.has(mode));

    return modes.length === 0 ? [] : validModes;
}

function buildPanelGroupViewModels(summary, panelDisplayModes, panelPercentMode, panelLabelMode) {
    if (!summary)
        return [];

    const groups = [];
    const groupByProvider = new Map();

    for (const mode of normalizePanelDisplayModes(panelDisplayModes)) {
        const config = PANEL_MODE_CONFIG_MAP.get(mode);
        if (!config)
            continue;

        const metric = getPanelMetricFromConfig(summary, config, panelPercentMode);
        let group = groupByProvider.get(config.providerKey);

        if (!group) {
            group = {
                providerKey: config.providerKey,
                providerName: config.providerName,
                items: [],
            };
            groupByProvider.set(config.providerKey, group);
            groups.push(group);
        }

        group.items.push({
            key: metric.key,
            label: panelLabelMode === 'expanded' ? metric.serviceLabel : metric.windowShortLabel,
            percentText: metric.percentText,
        });
    }

    return groups;
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

function buildServiceViewModel(key, name, providerData, providerCode, now) {
    const data = providerData ?? null;
    const sessionConfig = PANEL_MODE_CONFIG_MAP.get(`${key}-session`);
    const weeklyConfig = PANEL_MODE_CONFIG_MAP.get(`${key}-weekly`);

    return {
        key,
        name,
        windows: [
            buildWindowViewModel(
                sessionConfig?.serviceLabel ?? 'Session',
                data?.sessionRemainingPct,
                data?.sessionResetsAtIso,
                now,
            ),
            buildWindowViewModel(
                weeklyConfig?.serviceLabel ?? 'Week',
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
    const panelDisplayModes = deps.panelDisplayModes ?? DEFAULT_PANEL_DISPLAY_MODES;
    const panelPercentMode = deps.panelPercentMode === 'used' ? 'used' : 'left';
    const panelLabelMode = deps.panelLabelMode === 'expanded' ? 'expanded' : 'compact';

    const claude = summary?.providers?.claude ?? null;
    const codex = summary?.providers?.codex ?? null;

    return {
        panelGroups: buildPanelGroupViewModels(summary, panelDisplayModes, panelPercentMode, panelLabelMode),
        panelPercentMode,
        panelLabelMode,
        services: [
            buildServiceViewModel('codex', 'Codex', codex?.data, codex?.code, now),
            buildServiceViewModel('claude', 'Claude', claude?.data, claude?.code, now),
        ],
        version,
        lastUpdate: formatNextUpdate(summary?.lastUpdatedAtIso, pollIntervalMs, now),
    };
}
