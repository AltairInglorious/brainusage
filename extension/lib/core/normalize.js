function clampPercent(value) {
    if (!Number.isFinite(value))
        return 0;

    if (value < 0)
        return 0;

    if (value > 100)
        return 100;

    return value;
}

function toFinitePercent(value) {
    const percent = Number(value);
    if (!Number.isFinite(percent))
        return undefined;

    return clampPercent(percent);
}

function unixSecondsToIso(value) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds))
        return null;

    return new Date(seconds * 1000).toISOString();
}

export function normalizeClaudeUsage(payload) {
    const fiveHourUtilization = toFinitePercent(payload?.five_hour?.utilization);
    const sevenDayUtilization = toFinitePercent(payload?.seven_day?.utilization);

    return {
        data: {
            sessionRemainingPct: Number.isFinite(fiveHourUtilization)
                ? clampPercent(100 - fiveHourUtilization)
                : 0,
            weeklyRemainingPct: Number.isFinite(sevenDayUtilization)
                ? clampPercent(100 - sevenDayUtilization)
                : 0,
            sessionUsedPct: fiveHourUtilization,
            weeklyUsedPct: sevenDayUtilization,
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
    const primaryUsedPct = toFinitePercent(primaryWindow?.used_percent);
    const secondaryUsedPct = toFinitePercent(secondaryWindow?.used_percent);

    return {
        data: {
            sessionRemainingPct: Number.isFinite(primaryUsedPct)
                ? clampPercent(100 - primaryUsedPct)
                : 0,
            weeklyRemainingPct: Number.isFinite(secondaryUsedPct)
                ? clampPercent(100 - secondaryUsedPct)
                : 0,
            sessionUsedPct: primaryUsedPct,
            weeklyUsedPct: secondaryUsedPct,
            sessionResetsAtIso: unixSecondsToIso(primaryWindow?.reset_at),
            weeklyResetsAtIso: unixSecondsToIso(secondaryWindow?.reset_at),
        },
        hasPrimaryWindow: Boolean(primaryWindow),
        hasSecondaryWindow: Boolean(secondaryWindow),
        hasPartialData: !primaryWindow || !secondaryWindow,
    };
}
