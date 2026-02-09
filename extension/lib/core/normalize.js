function clampPercent(value) {
    if (!Number.isFinite(value))
        return 0;

    if (value < 0)
        return 0;

    if (value > 100)
        return 100;

    return value;
}

function unixSecondsToIso(value) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds))
        return null;

    return new Date(seconds * 1000).toISOString();
}

export function normalizeClaudeUsage(payload) {
    const fiveHourUtilization = Number(payload?.five_hour?.utilization);
    const sevenDayUtilization = Number(payload?.seven_day?.utilization);

    return {
        data: {
            sessionRemainingPct: clampPercent(100 - fiveHourUtilization),
            weeklyRemainingPct: clampPercent(100 - sevenDayUtilization),
            sessionResetsAtIso: payload?.five_hour?.resets_at ?? null,
            weeklyResetsAtIso: payload?.seven_day?.resets_at ?? null,
        },
        hasSessionUsage: Number.isFinite(fiveHourUtilization),
        hasWeeklyUsage: Number.isFinite(sevenDayUtilization),
    };
}

export function normalizeCodexUsage(payload) {
    const primaryWindow = payload?.rate_limit?.primary_window;
    const secondaryWindow = payload?.rate_limit?.secondary_window;

    return {
        data: {
            sessionRemainingPct: clampPercent(100 - Number(primaryWindow?.used_percent)),
            weeklyRemainingPct: clampPercent(100 - Number(secondaryWindow?.used_percent)),
            sessionResetsAtIso: unixSecondsToIso(primaryWindow?.reset_at),
            weeklyResetsAtIso: unixSecondsToIso(secondaryWindow?.reset_at),
        },
        hasPrimaryWindow: Boolean(primaryWindow),
        hasSecondaryWindow: Boolean(secondaryWindow),
        hasPartialData: !primaryWindow || !secondaryWindow,
    };
}
