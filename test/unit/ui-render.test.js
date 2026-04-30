import {describe, expect, test} from 'bun:test';

import {buildUsageViewModel, formatRelativeTime, getDotColor} from '../../extension/lib/ui/render.js';

const NOW = new Date('2026-02-09T10:00:00Z').getTime();

function makeWindow(label, pct, resetsInText, dotColor) {
    return {
        label,
        remainingPct: pct,
        remainingText: `${pct}% left`,
        resetsInText,
        dotColor,
    };
}

function makePanelGroup(providerKey, providerName, items) {
    return {
        providerKey,
        providerName,
        items,
    };
}

describe('buildUsageViewModel', () => {
    test('renders placeholder values when summary is null', () => {
        const view = buildUsageViewModel(null, {now: NOW});

        expect(view.panelGroups).toEqual([]);
        expect(view.services).toHaveLength(2);
        expect(view.services[0].name).toBe('Codex');
        expect(view.services[1].name).toBe('Claude');

        for (const svc of view.services) {
            expect(svc.warning).toBe('');

            for (const w of svc.windows) {
                expect(w.remainingPct).toBe(0);
                expect(w.remainingText).toBe('-- left');
                expect(w.resetsInText).toBe('--');
                expect(w.dotColor).toBe('red');
            }
        }

        expect(view.version).toBe('brainusage 0.0.1');
        expect(view.lastUpdate).toBe('Next update in --');
    });

    test('maps usage values with relative reset times', () => {
        const view = buildUsageViewModel({
            lastUpdatedAtIso: '2026-02-09T09:58:00.000Z',
            providers: {
                claude: {
                    code: 'OK',
                    data: {
                        sessionRemainingPct: 60,
                        weeklyRemainingPct: 25,
                        sessionUsedPct: 40,
                        weeklyUsedPct: 75,
                        sessionResetsAtIso: '2026-02-09T12:18:00.000Z',
                        weeklyResetsAtIso: '2026-02-13T17:00:00.000Z',
                    },
                },
                codex: {
                    code: 'AUTH_EXPIRED',
                    data: {
                        sessionRemainingPct: 73,
                        weeklyRemainingPct: 91,
                        sessionUsedPct: 27,
                        weeklyUsedPct: 9,
                        sessionResetsAtIso: '2026-02-09T12:18:00.000Z',
                        weeklyResetsAtIso: '2026-02-13T17:00:00.000Z',
                    },
                },
            },
        }, {now: NOW});

        expect(view.panelGroups).toEqual([
            makePanelGroup('codex', 'Codex', [
                {key: 'codex-session', label: 's', percentText: '73%'},
                {key: 'codex-weekly', label: 'w', percentText: '91%'},
            ]),
            makePanelGroup('claude', 'Claude', [
                {key: 'claude-session', label: 's', percentText: '60%'},
                {key: 'claude-weekly', label: 'w', percentText: '25%'},
            ]),
        ]);

        const codex = view.services[0];
        expect(codex.name).toBe('Codex');
        expect(codex.windows[0]).toEqual(makeWindow('Session', 73, 'Resets in 2h 18m', 'green'));
        expect(codex.windows[1]).toEqual(makeWindow('Week', 91, 'Resets in 4d 7h', 'green'));
        expect(codex.warning).toBe('Codex: authentication expired');

        const claude = view.services[1];
        expect(claude.name).toBe('Claude');
        expect(claude.windows[0]).toEqual(makeWindow('Session', 60, 'Resets in 2h 18m', 'yellow'));
        expect(claude.windows[1]).toEqual(makeWindow('Week', 25, 'Resets in 4d 7h', 'red'));
        expect(claude.warning).toBe('');
    });

    test('panelLabelMode expanded spells out session and week', () => {
        const view = buildUsageViewModel({
            providers: {
                claude: {
                    code: 'OK',
                    data: {
                        sessionRemainingPct: 60,
                        weeklyRemainingPct: 25,
                        sessionUsedPct: 40,
                        weeklyUsedPct: 75,
                    },
                },
                codex: {
                    code: 'OK',
                    data: {
                        sessionRemainingPct: 73,
                        weeklyRemainingPct: 91,
                        sessionUsedPct: 27,
                        weeklyUsedPct: 9,
                    },
                },
            },
        }, {now: NOW, panelLabelMode: 'expanded'});

        expect(view.panelLabelMode).toBe('expanded');
        expect(view.panelGroups).toEqual([
            makePanelGroup('codex', 'Codex', [
                {key: 'codex-session', label: 'Session', percentText: '73%'},
                {key: 'codex-weekly', label: 'Week', percentText: '91%'},
            ]),
            makePanelGroup('claude', 'Claude', [
                {key: 'claude-session', label: 'Session', percentText: '60%'},
                {key: 'claude-weekly', label: 'Week', percentText: '25%'},
            ]),
        ]);
    });

    test('shows warning messages for error states', () => {
        const view = buildUsageViewModel({
            providers: {
                claude: {code: 'NETWORK_ERROR', data: null},
                codex: {code: 'PARTIAL_DATA', data: null},
            },
        }, {now: NOW});

        expect(view.services[1].warning).toBe('Claude: network error');
        expect(view.services[0].warning).toBe('Codex: partial usage data');
    });

    test('formats next update countdown from last update time', () => {
        const view = buildUsageViewModel({
            lastUpdatedAtIso: '2026-02-09T09:58:00.000Z',
            providers: {},
        }, {now: NOW, pollIntervalMs: 180_000});

        expect(view.lastUpdate).toBe('Next update in 1m');
    });

    test('shows 0m when update is overdue', () => {
        const view = buildUsageViewModel({
            lastUpdatedAtIso: '2026-02-09T09:50:00.000Z',
            providers: {},
        }, {now: NOW, pollIntervalMs: 180_000});

        expect(view.lastUpdate).toBe('Next update in 0m');
    });

    test('accepts custom version string', () => {
        const view = buildUsageViewModel(null, {now: NOW, version: 'test 1.0'});
        expect(view.version).toBe('test 1.0');
    });

    test('panelDisplayModes can render a single selected metric', () => {
        const view = buildUsageViewModel({
            providers: {
                claude: {
                    code: 'OK',
                    data: {
                        sessionRemainingPct: 60,
                        weeklyRemainingPct: 25,
                        sessionUsedPct: 40,
                        weeklyUsedPct: 75,
                    },
                },
                codex: {
                    code: 'OK',
                    data: {
                        sessionRemainingPct: 73,
                        weeklyRemainingPct: 91,
                        sessionUsedPct: 27,
                        weeklyUsedPct: 9,
                    },
                },
            },
        }, {now: NOW, panelDisplayModes: ['claude-session']});

        expect(view.panelGroups).toEqual([
            makePanelGroup('claude', 'Claude', [
                {key: 'claude-session', label: 's', percentText: '60%'},
            ]),
        ]);
    });

    test('panelDisplayModes preserves selection order and can mix providers', () => {
        const view = buildUsageViewModel({
            providers: {
                codex: {
                    code: 'OK',
                    data: {
                        sessionRemainingPct: 73,
                        weeklyRemainingPct: 91,
                        sessionUsedPct: 27,
                        weeklyUsedPct: 9,
                    },
                },
                claude: {
                    code: 'OK',
                    data: {
                        sessionRemainingPct: 60,
                        weeklyRemainingPct: 25,
                        sessionUsedPct: 40,
                        weeklyUsedPct: 75,
                    },
                },
            },
        }, {now: NOW, panelDisplayModes: ['claude-weekly', 'codex-session']});

        expect(view.panelGroups).toEqual([
            makePanelGroup('codex', 'Codex', [
                {key: 'codex-session', label: 's', percentText: '73%'},
            ]),
            makePanelGroup('claude', 'Claude', [
                {key: 'claude-weekly', label: 'w', percentText: '25%'},
            ]),
        ]);
    });

    test('panelDisplayModes defaults to all four metrics', () => {
        const view = buildUsageViewModel({
            providers: {
                claude: {
                    code: 'OK',
                    data: {
                        sessionRemainingPct: 60,
                        weeklyRemainingPct: 25,
                        sessionUsedPct: 40,
                        weeklyUsedPct: 75,
                    },
                },
                codex: {
                    code: 'OK',
                    data: {
                        sessionRemainingPct: 73,
                        weeklyRemainingPct: 91,
                        sessionUsedPct: 27,
                        weeklyUsedPct: 9,
                    },
                },
            },
        }, {now: NOW});

        expect(view.panelGroups).toEqual([
            makePanelGroup('codex', 'Codex', [
                {key: 'codex-session', label: 's', percentText: '73%'},
                {key: 'codex-weekly', label: 'w', percentText: '91%'},
            ]),
            makePanelGroup('claude', 'Claude', [
                {key: 'claude-session', label: 's', percentText: '60%'},
                {key: 'claude-weekly', label: 'w', percentText: '25%'},
            ]),
        ]);
    });

    test('panelDisplayModes with missing provider data still shows placeholders', () => {
        const view = buildUsageViewModel({providers: {}}, {
            now: NOW,
            panelDisplayModes: ['claude-session'],
        });

        expect(view.panelGroups).toEqual([
            makePanelGroup('claude', 'Claude', [
                {key: 'claude-session', label: 's', percentText: '--'},
            ]),
        ]);
    });

    test('panelDisplayModes filters unknown keys out', () => {
        const view = buildUsageViewModel({
            providers: {
                claude: {
                    code: 'OK',
                    data: {
                        sessionRemainingPct: 60,
                        weeklyRemainingPct: 25,
                        sessionUsedPct: 40,
                        weeklyUsedPct: 75,
                    },
                },
            },
        }, {
            now: NOW,
            panelDisplayModes: ['unknown-mode', 'claude-session'],
        });

        expect(view.panelGroups).toEqual([
            makePanelGroup('claude', 'Claude', [
                {key: 'claude-session', label: 's', percentText: '60%'},
            ]),
        ]);
    });

    test('panelPercentMode used shows used values for all selected metrics', () => {
        const view = buildUsageViewModel({
            providers: {
                claude: {
                    code: 'OK',
                    data: {
                        sessionRemainingPct: 60,
                        weeklyRemainingPct: 25,
                        sessionUsedPct: 40,
                        weeklyUsedPct: 75,
                    },
                },
                codex: {
                    code: 'OK',
                    data: {
                        sessionRemainingPct: 73,
                        weeklyRemainingPct: 91,
                        sessionUsedPct: 27,
                        weeklyUsedPct: 9,
                    },
                },
            },
        }, {
            now: NOW,
            panelDisplayModes: ['codex-weekly', 'claude-session'],
            panelPercentMode: 'used',
        });

        expect(view.panelGroups).toEqual([
            makePanelGroup('codex', 'Codex', [
                {key: 'codex-weekly', label: 'w', percentText: '9%'},
            ]),
            makePanelGroup('claude', 'Claude', [
                {key: 'claude-session', label: 's', percentText: '40%'},
            ]),
        ]);
    });

    test('empty panelDisplayModes hides all panel groups', () => {
        const view = buildUsageViewModel({
            providers: {
                claude: {
                    code: 'OK',
                    data: {
                        sessionRemainingPct: 60,
                        weeklyRemainingPct: 25,
                        sessionUsedPct: 40,
                        weeklyUsedPct: 75,
                    },
                },
            },
        }, {
            now: NOW,
            panelDisplayModes: [],
        });

        expect(view.panelGroups).toEqual([]);
    });
});

describe('formatRelativeTime', () => {
    test('formats hours and minutes', () => {
        const reset = '2026-02-09T12:18:00.000Z';
        expect(formatRelativeTime(reset, NOW)).toBe('2h 18m');
    });

    test('formats days and hours', () => {
        const reset = '2026-02-13T17:00:00.000Z';
        expect(formatRelativeTime(reset, NOW)).toBe('4d 7h');
    });

    test('formats minutes only', () => {
        const reset = '2026-02-09T10:31:00.000Z';
        expect(formatRelativeTime(reset, NOW)).toBe('31m');
    });

    test('returns -- for past timestamps', () => {
        const reset = '2026-02-09T09:00:00.000Z';
        expect(formatRelativeTime(reset, NOW)).toBe('--');
    });

    test('returns -- for null', () => {
        expect(formatRelativeTime(null, NOW)).toBe('--');
    });

    test('returns -- for invalid ISO', () => {
        expect(formatRelativeTime('not-a-date', NOW)).toBe('--');
    });

    test('returns 0m when difference is under 1 minute', () => {
        const reset = '2026-02-09T10:00:30.000Z';
        expect(formatRelativeTime(reset, NOW)).toBe('0m');
    });
});

describe('getDotColor', () => {
    test('green for >= 70', () => {
        expect(getDotColor(70)).toBe('green');
        expect(getDotColor(100)).toBe('green');
    });

    test('yellow for 30-69', () => {
        expect(getDotColor(30)).toBe('yellow');
        expect(getDotColor(69)).toBe('yellow');
    });

    test('red for < 30', () => {
        expect(getDotColor(29)).toBe('red');
        expect(getDotColor(0)).toBe('red');
    });

    test('red for non-finite', () => {
        expect(getDotColor(undefined)).toBe('red');
        expect(getDotColor(NaN)).toBe('red');
    });
});
