import {describe, expect, test} from 'bun:test';

import {buildUsageViewModel, formatRelativeTime, getDotColor, PANEL_LABEL_MODES} from '../../shared/ui/render.js';

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

describe('buildUsageViewModel', () => {
    test('renders placeholder values when summary is null', () => {
        const view = buildUsageViewModel(null, {now: NOW});

        expect(view.panelLabel).toBe('--');
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
            minRemainingPct: 12.4,
            lastUpdatedAtIso: '2026-02-09T09:58:00.000Z',
            providers: {
                claude: {
                    code: 'OK',
                    data: {
                        sessionRemainingPct: 60,
                        weeklyRemainingPct: 25,
                        sessionResetsAtIso: '2026-02-09T12:18:00.000Z',
                        weeklyResetsAtIso: '2026-02-13T17:00:00.000Z',
                    },
                },
                codex: {
                    code: 'AUTH_EXPIRED',
                    data: {
                        sessionRemainingPct: 73,
                        weeklyRemainingPct: 91,
                        sessionResetsAtIso: '2026-02-09T12:18:00.000Z',
                        weeklyResetsAtIso: '2026-02-13T17:00:00.000Z',
                    },
                },
            },
        }, {now: NOW});

        expect(view.panelLabel).toBe('12%');

        const codex = view.services[0];
        expect(codex.name).toBe('Codex');
        expect(codex.windows[0]).toEqual(makeWindow('Session', 73, 'Resets in 2h 18m', 'green'));
        expect(codex.windows[1]).toEqual(makeWindow('Weekly', 91, 'Resets in 4d 7h', 'green'));
        expect(codex.warning).toBe('Codex: authentication expired');

        const claude = view.services[1];
        expect(claude.name).toBe('Claude');
        expect(claude.windows[0]).toEqual(makeWindow('Session', 60, 'Resets in 2h 18m', 'yellow'));
        expect(claude.windows[1]).toEqual(makeWindow('Weekly', 25, 'Resets in 4d 7h', 'red'));
        expect(claude.warning).toBe('');
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

    test('panelLabelMode claude-session shows claude session %', () => {
        const view = buildUsageViewModel({
            minRemainingPct: 12.4,
            providers: {
                claude: {
                    code: 'OK',
                    data: {sessionRemainingPct: 60, weeklyRemainingPct: 25},
                },
                codex: {
                    code: 'OK',
                    data: {sessionRemainingPct: 73, weeklyRemainingPct: 91},
                },
            },
        }, {now: NOW, panelLabelMode: 'claude-session'});
        expect(view.panelLabel).toBe('60%');
    });

    test('panelLabelMode claude-weekly shows claude weekly %', () => {
        const view = buildUsageViewModel({
            minRemainingPct: 12.4,
            providers: {
                claude: {
                    code: 'OK',
                    data: {sessionRemainingPct: 60, weeklyRemainingPct: 25},
                },
            },
        }, {now: NOW, panelLabelMode: 'claude-weekly'});
        expect(view.panelLabel).toBe('25%');
    });

    test('panelLabelMode codex-session shows codex session %', () => {
        const view = buildUsageViewModel({
            minRemainingPct: 12.4,
            providers: {
                codex: {
                    code: 'OK',
                    data: {sessionRemainingPct: 73, weeklyRemainingPct: 91},
                },
            },
        }, {now: NOW, panelLabelMode: 'codex-session'});
        expect(view.panelLabel).toBe('73%');
    });

    test('panelLabelMode codex-weekly shows codex weekly %', () => {
        const view = buildUsageViewModel({
            minRemainingPct: 12.4,
            providers: {
                codex: {
                    code: 'OK',
                    data: {sessionRemainingPct: 73, weeklyRemainingPct: 91},
                },
            },
        }, {now: NOW, panelLabelMode: 'codex-weekly'});
        expect(view.panelLabel).toBe('91%');
    });

    test('panelLabelMode defaults to min', () => {
        const view = buildUsageViewModel({
            minRemainingPct: 12.4,
            providers: {
                claude: {
                    code: 'OK',
                    data: {sessionRemainingPct: 60, weeklyRemainingPct: 25},
                },
            },
        }, {now: NOW});
        expect(view.panelLabel).toBe('12%');
    });

    test('panelLabelMode with missing provider data shows --', () => {
        const view = buildUsageViewModel({providers: {}}, {now: NOW, panelLabelMode: 'claude-session'});
        expect(view.panelLabel).toBe('--');
    });

    test('panelLabelMode with unknown mode falls back to min', () => {
        const view = buildUsageViewModel({
            minRemainingPct: 42,
            providers: {},
        }, {now: NOW, panelLabelMode: 'unknown-mode'});
        expect(view.panelLabel).toBe('42%');
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
