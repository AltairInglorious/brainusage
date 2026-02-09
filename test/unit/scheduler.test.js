import {afterEach, describe, expect, setSystemTime, test, vi} from 'bun:test';

import {createBackoffManager} from '../../extension/lib/core/backoff.js';
import {createScheduler, DEFAULT_POLL_INTERVAL_MS} from '../../extension/lib/core/scheduler.js';

async function flushMicrotasks() {
    await Promise.resolve();
    await Promise.resolve();
}

function deferred() {
    let resolve;
    let reject;

    const promise = new Promise((nextResolve, nextReject) => {
        resolve = nextResolve;
        reject = nextReject;
    });

    return {promise, resolve, reject};
}

afterEach(() => {
    vi.useRealTimers();
});

describe('scheduler', () => {
    test('polls all providers every 180000ms', async () => {
        vi.useFakeTimers();
        setSystemTime(new Date('2026-02-08T00:00:00.000Z'));

        let claudeCalls = 0;
        let codexCalls = 0;

        const scheduler = createScheduler({
            providers: {
                claude: {
                    async getUsage() {
                        claudeCalls += 1;
                        return {ok: true, data: {sessionRemainingPct: 80, weeklyRemainingPct: 70}};
                    },
                },
                codex: {
                    async getUsage() {
                        codexCalls += 1;
                        return {ok: true, data: {sessionRemainingPct: 60, weeklyRemainingPct: 50}};
                    },
                },
            },
        });

        scheduler.start();
        await flushMicrotasks();

        expect(claudeCalls).toBe(1);
        expect(codexCalls).toBe(1);

        vi.advanceTimersByTime(DEFAULT_POLL_INTERVAL_MS - 1);
        await flushMicrotasks();

        expect(claudeCalls).toBe(1);
        expect(codexCalls).toBe(1);

        vi.advanceTimersByTime(1);
        await flushMicrotasks();

        expect(claudeCalls).toBe(2);
        expect(codexCalls).toBe(2);
        scheduler.stop();
    });

    test('keeps one in-flight request per provider and applies newest result', async () => {
        const first = deferred();
        let calls = 0;
        let active = 0;
        let peakActive = 0;

        const scheduler = createScheduler({
            providers: {
                claude: {
                    async getUsage() {
                        calls += 1;
                        active += 1;
                        peakActive = Math.max(peakActive, active);

                        if (calls === 1)
                            return first.promise.finally(() => {
                                active -= 1;
                            });

                        active -= 1;
                        return {
                            ok: true,
                            data: {
                                sessionRemainingPct: 88,
                                weeklyRemainingPct: 77,
                            },
                        };
                    },
                },
            },
        });

        const initialRefresh = scheduler.refresh();
        await flushMicrotasks();

        const queuedRefresh = scheduler.refresh();
        await flushMicrotasks();
        expect(calls).toBe(1);

        first.resolve({
            ok: true,
            data: {
                sessionRemainingPct: 20,
                weeklyRemainingPct: 10,
            },
        });

        await initialRefresh;
        await queuedRefresh;

        const summary = scheduler.getSummary();
        expect(calls).toBe(2);
        expect(peakActive).toBe(1);
        expect(summary.providers.claude.data).toEqual({
            sessionRemainingPct: 88,
            weeklyRemainingPct: 77,
        });
    });

    test('maps provider errors to unified state codes and computes summary fields', async () => {
        const scheduler = createScheduler({
            nowIso: () => '2026-02-08T12:00:00.000Z',
            providers: {
                claude: {
                    async getUsage() {
                        return {
                            ok: false,
                            error: {
                                code: 'auth_expired',
                                message: 'token expired',
                            },
                        };
                    },
                },
                codex: {
                    async getUsage() {
                        return {
                            ok: false,
                            error: {
                                code: 'partial_data',
                                message: 'missing weekly window',
                            },
                            data: {
                                sessionRemainingPct: 42,
                                weeklyRemainingPct: 0,
                            },
                        };
                    },
                },
            },
        });

        await scheduler.refresh();
        const summary = scheduler.getSummary();

        expect(summary.providers.claude.code).toBe('AUTH_EXPIRED');
        expect(summary.providers.codex.code).toBe('PARTIAL_DATA');
        expect(summary.providers.codex.error.providerCode).toBe('partial_data');
        expect(summary.minRemainingPct).toBe(0);
        expect(summary.lastUpdatedAtIso).toBe('2026-02-08T12:00:00.000Z');
    });

    test('skips polling while provider is in backoff window', async () => {
        let nowMs = 0;
        let calls = 0;

        const scheduler = createScheduler({
            backoffManager: createBackoffManager({
                initialDelayMs: 100,
                maxDelayMs: 500,
                nowMs: () => nowMs,
            }),
            providers: {
                codex: {
                    async getUsage() {
                        calls += 1;

                        if (calls === 1) {
                            return {
                                ok: false,
                                error: {
                                    code: 'rate_limited',
                                    message: 'slow down',
                                },
                            };
                        }

                        return {
                            ok: true,
                            data: {
                                sessionRemainingPct: 90,
                                weeklyRemainingPct: 80,
                            },
                        };
                    },
                },
            },
        });

        await scheduler.refresh();
        expect(calls).toBe(1);

        await scheduler.refresh();
        expect(calls).toBe(1);

        nowMs = 99;
        await scheduler.refresh();
        expect(calls).toBe(1);

        nowMs = 100;
        await scheduler.refresh();
        expect(calls).toBe(2);
    });
});
