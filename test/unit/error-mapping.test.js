import {describe, expect, test} from 'bun:test';

import {createBackoffManager} from '../../extension/lib/core/backoff.js';
import {claudeProviderConfig, createClaudeProvider} from '../../extension/lib/providers/claude.js';
import {codexProviderConfig, createCodexProvider} from '../../extension/lib/providers/codex.js';

function createJsonResponse(status, payload) {
    return {
        ok: status >= 200 && status < 300,
        status,
        async json() {
            return payload;
        },
    };
}

function createInvalidJsonResponse(status) {
    return {
        ok: status >= 200 && status < 300,
        status,
        async json() {
            throw new Error('invalid json');
        },
    };
}

describe('provider error mapping', () => {
    test('maps Claude 404 response to schema_changed', async () => {
        const provider = createClaudeProvider({
            readTextFile: async () => JSON.stringify({
                claudeAiOauth: {
                    access_token: 'token',
                    refresh_token: 'refresh-token',
                },
            }),
            fetch: async (url) => {
                if (url === claudeProviderConfig.USAGE_ENDPOINT)
                    return createJsonResponse(404, {});

                throw new Error(`Unexpected URL: ${url}`);
            },
        });

        const result = await provider.getUsage();
        expect(result.ok).toBe(false);
        expect(result.error.code).toBe('schema_changed');
    });

    test('maps Codex 429 response to rate_limited', async () => {
        const provider = createCodexProvider({
            readTextFile: async () => JSON.stringify({
                tokens: {
                    access_token: 'token',
                    refresh_token: 'refresh-token',
                },
            }),
            fetch: async (url) => {
                if (url === codexProviderConfig.USAGE_ENDPOINT)
                    return createJsonResponse(429, {});

                throw new Error(`Unexpected URL: ${url}`);
            },
        });

        const result = await provider.getUsage();
        expect(result.ok).toBe(false);
        expect(result.error.code).toBe('rate_limited');
    });

    test('maps Codex 5xx response to network_error', async () => {
        const provider = createCodexProvider({
            readTextFile: async () => JSON.stringify({
                tokens: {
                    access_token: 'token',
                    refresh_token: 'refresh-token',
                },
            }),
            fetch: async (url) => {
                if (url === codexProviderConfig.USAGE_ENDPOINT)
                    return createJsonResponse(503, {});

                throw new Error(`Unexpected URL: ${url}`);
            },
        });

        const result = await provider.getUsage();
        expect(result.ok).toBe(false);
        expect(result.error.code).toBe('network_error');
    });

    test('maps invalid JSON responses to schema_changed', async () => {
        const provider = createClaudeProvider({
            readTextFile: async () => JSON.stringify({
                claudeAiOauth: {
                    access_token: 'token',
                    refresh_token: 'refresh-token',
                },
            }),
            fetch: async (url) => {
                if (url === claudeProviderConfig.USAGE_ENDPOINT)
                    return createInvalidJsonResponse(200);

                throw new Error(`Unexpected URL: ${url}`);
            },
        });

        const result = await provider.getUsage();
        expect(result.ok).toBe(false);
        expect(result.error.code).toBe('schema_changed');
    });

    test('returns partial_data when Claude payload misses one key field', async () => {
        const provider = createClaudeProvider({
            readTextFile: async () => JSON.stringify({
                claudeAiOauth: {
                    access_token: 'token',
                    refresh_token: 'refresh-token',
                },
            }),
            fetch: async (url) => {
                if (url === claudeProviderConfig.USAGE_ENDPOINT) {
                    return createJsonResponse(200, {
                        five_hour: {
                            utilization: 40,
                            resets_at: '2026-02-09T00:00:00.000Z',
                        },
                    });
                }

                throw new Error(`Unexpected URL: ${url}`);
            },
        });

        const result = await provider.getUsage();
        expect(result.ok).toBe(false);
        expect(result.error.code).toBe('partial_data');
    });
});

describe('backoff manager', () => {
    test('backs off on rate_limited and repeated network_error with cap', () => {
        let nowMs = 0;

        const backoff = createBackoffManager({
            nowMs: () => nowMs,
            initialDelayMs: 100,
            maxDelayMs: 500,
        });

        backoff.recordResult('codex', {ok: false, error: {code: 'rate_limited', message: 'limited'}});
        expect(backoff.getBackoffUntilMs('codex')).toBe(100);
        expect(backoff.shouldBackoff('codex')).toBe(true);

        nowMs = 100;
        expect(backoff.shouldBackoff('codex')).toBe(false);

        backoff.recordResult('codex', {ok: false, error: {code: 'network_error', message: 'x'}});
        expect(backoff.getBackoffUntilMs('codex')).toBe(100);

        backoff.recordResult('codex', {ok: false, error: {code: 'network_error', message: 'y'}});
        expect(backoff.getBackoffUntilMs('codex')).toBe(300);

        nowMs = 300;
        backoff.recordResult('codex', {ok: false, error: {code: 'rate_limited', message: 'limited again'}});
        expect(backoff.getBackoffUntilMs('codex')).toBe(700);

        nowMs = 700;
        backoff.recordResult('codex', {ok: false, error: {code: 'rate_limited', message: 'still limited'}});
        expect(backoff.getBackoffUntilMs('codex')).toBe(1200);
    });
});
