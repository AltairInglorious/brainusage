function formatPercent(value) {
    if (!Number.isFinite(value))
        return '--';

    return `${Math.round(value)}%`;
}

function formatIsoMinuteUtc(iso) {
    if (!iso)
        return '--';

    const date = new Date(iso);
    if (Number.isNaN(date.getTime()))
        return '--';

    const year = String(date.getUTCFullYear()).padStart(4, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hour = String(date.getUTCHours()).padStart(2, '0');
    const minute = String(date.getUTCMinutes()).padStart(2, '0');

    return `${year}-${month}-${day} ${hour}:${minute} UTC`;
}

function formatLastUpdate(iso) {
    return formatIsoMinuteUtc(iso);
}

function getProvider(summary, providerName) {
    return summary?.providers?.[providerName] ?? null;
}

function buildUsageLine(providerLabel, windowLabel, remainingPct, resetsAtIso) {
    const base = `${providerLabel} ${windowLabel}: ${formatPercent(remainingPct)}`;
    if (!resetsAtIso)
        return base;

    return `${base} (resets ${formatIsoMinuteUtc(resetsAtIso)})`;
}

function toWarningText(providerLabel, code) {
    if (code === 'AUTH_EXPIRED')
        return `${providerLabel} warning: authentication expired`;

    if (code === 'PARTIAL_DATA')
        return `${providerLabel} warning: partial usage data`;

    if (code === 'NETWORK_ERROR')
        return `${providerLabel} warning: network error`;

    if (code === 'SCHEMA_CHANGED')
        return `${providerLabel} warning: schema changed`;

    return '';
}

function toStatusText(providerLabel, code) {
    if (!code || code === 'OK')
        return `${providerLabel}: OK`;

    return `${providerLabel}: ${code}`;
}

export function buildUsageViewModel(summary) {
    const claude = getProvider(summary, 'claude');
    const codex = getProvider(summary, 'codex');
    const claudeData = claude?.data ?? null;
    const codexData = codex?.data ?? null;

    return {
        panelLabel: formatPercent(summary?.minRemainingPct),
        claudeSession: buildUsageLine('Claude', 'session', claudeData?.sessionRemainingPct, claudeData?.sessionResetsAtIso),
        claudeWeekly: buildUsageLine('Claude', 'weekly', claudeData?.weeklyRemainingPct, claudeData?.weeklyResetsAtIso),
        codexSession: buildUsageLine('Codex', 'session', codexData?.sessionRemainingPct, codexData?.sessionResetsAtIso),
        codexWeekly: buildUsageLine('Codex', 'weekly', codexData?.weeklyRemainingPct, codexData?.weeklyResetsAtIso),
        claudeStatus: toStatusText('Claude', claude?.code),
        codexStatus: toStatusText('Codex', codex?.code),
        claudeWarning: toWarningText('Claude', claude?.code),
        codexWarning: toWarningText('Codex', codex?.code),
        lastUpdate: `Last update: ${formatLastUpdate(summary?.lastUpdatedAtIso)}`,
    };
}
