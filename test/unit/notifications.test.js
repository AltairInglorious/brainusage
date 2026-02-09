import {describe, expect, test} from 'bun:test';

import {createThresholdNotifier} from '../../extension/lib/core/notifications.js';

function createSummary(overrides = {}) {
    return {
        providers: {
            claude: {
                data: {
                    sessionRemainingPct: 80,
                    weeklyRemainingPct: 75,
                    sessionResetsAtIso: '2026-02-09T10:00:00.000Z',
                    weeklyResetsAtIso: '2026-02-10T10:00:00.000Z',
                },
            },
            codex: {
                data: {
                    sessionRemainingPct: 70,
                    weeklyRemainingPct: 65,
                    sessionResetsAtIso: '2026-02-09T11:00:00.000Z',
                    weeklyResetsAtIso: '2026-02-10T11:00:00.000Z',
                },
            },
        },
        ...overrides,
    };
}

describe('threshold notifications', () => {
    test('notifies once for each provider/window when crossing below 20%', () => {
        const notifications = [];
        const notifier = createThresholdNotifier({
            notifyFn: (title, body) => {
                notifications.push({title, body});
            },
        });

        notifier.evaluate(createSummary());

        notifier.evaluate(createSummary({
            providers: {
                claude: {
                    data: {
                        sessionRemainingPct: 19,
                        weeklyRemainingPct: 10,
                        sessionResetsAtIso: '2026-02-09T10:00:00.000Z',
                        weeklyResetsAtIso: '2026-02-10T10:00:00.000Z',
                    },
                },
                codex: {
                    data: {
                        sessionRemainingPct: 5,
                        weeklyRemainingPct: 0,
                        sessionResetsAtIso: null,
                        weeklyResetsAtIso: '2026-02-10T11:00:00.000Z',
                    },
                },
            },
        }));

        expect(notifications).toEqual([
            {
                title: 'Claude session low',
                body: '19% remaining; resets 2026-02-09 10:00 UTC',
            },
            {
                title: 'Claude weekly low',
                body: '10% remaining; resets 2026-02-10 10:00 UTC',
            },
            {
                title: 'Codex session low',
                body: '5% remaining; resets --',
            },
            {
                title: 'Codex weekly low',
                body: '0% remaining; resets 2026-02-10 11:00 UTC',
            },
        ]);
    });

    test('does not repeat while still below threshold', () => {
        const notifications = [];
        const notifier = createThresholdNotifier({
            notifyFn: (title, body) => {
                notifications.push({title, body});
            },
        });

        notifier.evaluate(createSummary());
        notifier.evaluate(createSummary({
            providers: {
                claude: {
                    data: {
                        sessionRemainingPct: 19,
                        weeklyRemainingPct: 75,
                        sessionResetsAtIso: '2026-02-09T10:00:00.000Z',
                        weeklyResetsAtIso: '2026-02-10T10:00:00.000Z',
                    },
                },
                codex: {
                    data: {
                        sessionRemainingPct: 70,
                        weeklyRemainingPct: 65,
                        sessionResetsAtIso: '2026-02-09T11:00:00.000Z',
                        weeklyResetsAtIso: '2026-02-10T11:00:00.000Z',
                    },
                },
            },
        }));
        notifier.evaluate(createSummary({
            providers: {
                claude: {
                    data: {
                        sessionRemainingPct: 9,
                        weeklyRemainingPct: 75,
                        sessionResetsAtIso: '2026-02-09T10:00:00.000Z',
                        weeklyResetsAtIso: '2026-02-10T10:00:00.000Z',
                    },
                },
                codex: {
                    data: {
                        sessionRemainingPct: 70,
                        weeklyRemainingPct: 65,
                        sessionResetsAtIso: '2026-02-09T11:00:00.000Z',
                        weeklyResetsAtIso: '2026-02-10T11:00:00.000Z',
                    },
                },
            },
        }));

        expect(notifications).toHaveLength(1);
        expect(notifications[0]?.title).toBe('Claude session low');
    });

    test('re-arms dedupe when reset period changes', () => {
        const notifications = [];
        const notifier = createThresholdNotifier({
            notifyFn: (title, body) => {
                notifications.push({title, body});
            },
        });

        notifier.evaluate(createSummary());
        notifier.evaluate(createSummary({
            providers: {
                claude: {
                    data: {
                        sessionRemainingPct: 18,
                        weeklyRemainingPct: 75,
                        sessionResetsAtIso: '2026-02-09T10:00:00.000Z',
                        weeklyResetsAtIso: '2026-02-10T10:00:00.000Z',
                    },
                },
                codex: {
                    data: {
                        sessionRemainingPct: 70,
                        weeklyRemainingPct: 65,
                        sessionResetsAtIso: '2026-02-09T11:00:00.000Z',
                        weeklyResetsAtIso: '2026-02-10T11:00:00.000Z',
                    },
                },
            },
        }));
        notifier.evaluate(createSummary({
            providers: {
                claude: {
                    data: {
                        sessionRemainingPct: 50,
                        weeklyRemainingPct: 75,
                        sessionResetsAtIso: '2026-02-11T10:00:00.000Z',
                        weeklyResetsAtIso: '2026-02-10T10:00:00.000Z',
                    },
                },
                codex: {
                    data: {
                        sessionRemainingPct: 70,
                        weeklyRemainingPct: 65,
                        sessionResetsAtIso: '2026-02-09T11:00:00.000Z',
                        weeklyResetsAtIso: '2026-02-10T11:00:00.000Z',
                    },
                },
            },
        }));
        notifier.evaluate(createSummary({
            providers: {
                claude: {
                    data: {
                        sessionRemainingPct: 12,
                        weeklyRemainingPct: 75,
                        sessionResetsAtIso: '2026-02-11T10:00:00.000Z',
                        weeklyResetsAtIso: '2026-02-10T10:00:00.000Z',
                    },
                },
                codex: {
                    data: {
                        sessionRemainingPct: 70,
                        weeklyRemainingPct: 65,
                        sessionResetsAtIso: '2026-02-09T11:00:00.000Z',
                        weeklyResetsAtIso: '2026-02-10T11:00:00.000Z',
                    },
                },
            },
        }));

        expect(notifications.map((item) => item.title)).toEqual([
            'Claude session low',
            'Claude session low',
        ]);
    });

    test('skips notifications when provider or window data is missing', () => {
        const notifications = [];
        const notifier = createThresholdNotifier({
            notifyFn: (title, body) => {
                notifications.push({title, body});
            },
        });

        notifier.evaluate(createSummary());
        notifier.evaluate({
            providers: {
                claude: {
                    data: {
                        sessionRemainingPct: 10,
                        sessionResetsAtIso: '2026-02-09T10:00:00.000Z',
                    },
                },
            },
        });

        expect(notifications).toEqual([
            {
                title: 'Claude session low',
                body: '10% remaining; resets 2026-02-09 10:00 UTC',
            },
        ]);
    });

    test('does not notify on first observation already below threshold', () => {
        const notifications = [];
        const notifier = createThresholdNotifier({
            notifyFn: (title, body) => {
                notifications.push({title, body});
            },
        });

        notifier.evaluate(createSummary({
            providers: {
                claude: {
                    data: {
                        sessionRemainingPct: 10,
                        weeklyRemainingPct: 75,
                        sessionResetsAtIso: '2026-02-09T10:00:00.000Z',
                        weeklyResetsAtIso: '2026-02-10T10:00:00.000Z',
                    },
                },
                codex: {
                    data: {
                        sessionRemainingPct: 70,
                        weeklyRemainingPct: 65,
                        sessionResetsAtIso: '2026-02-09T11:00:00.000Z',
                        weeklyResetsAtIso: '2026-02-10T11:00:00.000Z',
                    },
                },
            },
        }));

        expect(notifications).toHaveLength(0);
    });
});
