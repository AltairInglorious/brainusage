import {describe, expect, test} from 'bun:test';

import {buildUsageViewModel} from '../../extension/lib/ui/render.js';

describe('buildUsageViewModel', () => {
    test('renders placeholder values when summary is empty', () => {
        const view = buildUsageViewModel(null);

        expect(view).toEqual({
            panelLabel: '--',
            claudeSession: 'Claude session: --',
            claudeWeekly: 'Claude weekly: --',
            codexSession: 'Codex session: --',
            codexWeekly: 'Codex weekly: --',
            claudeStatus: 'Claude: OK',
            codexStatus: 'Codex: OK',
            claudeWarning: '',
            codexWarning: '',
            lastUpdate: 'Last update: --',
        });
    });

    test('maps usage values, reset timestamps, and provider status', () => {
        const view = buildUsageViewModel({
            minRemainingPct: 12.4,
            lastUpdatedAtIso: '2026-02-08T16:07:00.000Z',
            providers: {
                claude: {
                    code: 'OK',
                    data: {
                        sessionRemainingPct: 60,
                        weeklyRemainingPct: 25,
                        sessionResetsAtIso: '2026-02-09T00:00:00.000Z',
                        weeklyResetsAtIso: '2026-02-12T00:00:00.000Z',
                    },
                },
                codex: {
                    code: 'AUTH_EXPIRED',
                    data: {
                        sessionRemainingPct: 40,
                        weeklyRemainingPct: 10,
                        sessionResetsAtIso: '2026-02-10T00:00:00.000Z',
                        weeklyResetsAtIso: '2026-02-13T00:00:00.000Z',
                    },
                },
            },
        });

        expect(view.panelLabel).toBe('12%');
        expect(view.claudeSession).toBe('Claude session: 60% (resets 2026-02-09 00:00 UTC)');
        expect(view.claudeWeekly).toBe('Claude weekly: 25% (resets 2026-02-12 00:00 UTC)');
        expect(view.codexSession).toBe('Codex session: 40% (resets 2026-02-10 00:00 UTC)');
        expect(view.codexWeekly).toBe('Codex weekly: 10% (resets 2026-02-13 00:00 UTC)');
        expect(view.claudeStatus).toBe('Claude: OK');
        expect(view.codexStatus).toBe('Codex: AUTH_EXPIRED');
        expect(view.claudeWarning).toBe('');
        expect(view.codexWarning).toBe('Codex warning: authentication expired');
        expect(view.lastUpdate).toBe('Last update: 2026-02-08 16:07 UTC');
    });

    test('shows network/schema/partial warning messages for providers', () => {
        const view = buildUsageViewModel({
            providers: {
                claude: {code: 'NETWORK_ERROR', data: null},
                codex: {code: 'PARTIAL_DATA', data: null},
            },
        });

        expect(view.claudeWarning).toBe('Claude warning: network error');
        expect(view.codexWarning).toBe('Codex warning: partial usage data');
    });
});
