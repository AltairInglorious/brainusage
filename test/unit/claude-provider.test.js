import {describe, expect, test} from 'bun:test';

import {createClaudeProvider, claudeProviderConfig} from '../../extension/lib/providers/claude.js';

function createJsonResponse(status, payload) {
    return {
        ok: status >= 200 && status < 300,
        status,
        async json() {
            return payload;
        },
    };
}

describe('Claude provider', () => {
    test('returns missing_creds when credentials file is absent', async () => {
        const provider = createClaudeProvider({
            readTextFile: async () => {
                throw new Error('ENOENT');
            },
            fetch: async () => createJsonResponse(200, {}),
        });

        const result = await provider.getUsage();

        expect(result.ok).toBe(false);
        expect(result.error.code).toBe('missing_creds');
    });

    test('returns parse_error when credentials JSON is invalid', async () => {
        const provider = createClaudeProvider({
            readTextFile: async () => '{bad json',
            fetch: async () => createJsonResponse(200, {}),
        });

        const result = await provider.getUsage();

        expect(result.ok).toBe(false);
        expect(result.error.code).toBe('parse_error');
    });

    test('refreshes when token is expired then normalizes usage response', async () => {
        const calls = [];
        const fetchMock = async (url, options) => {
            calls.push({url, options});

            if (url === claudeProviderConfig.REFRESH_ENDPOINT) {
                return createJsonResponse(200, {
                    access_token: 'fresh-token',
                    expires_at: new Date(Date.now() + 60_000).toISOString(),
                });
            }

            if (url === claudeProviderConfig.USAGE_ENDPOINT) {
                expect(options.headers['anthropic-beta']).toBe('oauth-2025-04-20');
                expect(options.headers.authorization).toBe('Bearer fresh-token');

                return createJsonResponse(200, {
                    five_hour: {
                        utilization: 40,
                        resets_at: '2026-02-09T00:00:00.000Z',
                    },
                    seven_day: {
                        utilization: 75,
                        resets_at: '2026-02-12T00:00:00.000Z',
                    },
                });
            }

            throw new Error(`Unexpected URL: ${url}`);
        };

        const provider = createClaudeProvider({
            readTextFile: async () => JSON.stringify({
                claudeAiOauth: {
                    access_token: 'stale-token',
                    refresh_token: 'refresh-token',
                    expires_at: new Date(Date.now() - 60_000).toISOString(),
                },
            }),
            fetch: fetchMock,
        });

        const result = await provider.getUsage();

        expect(result.ok).toBe(true);
        expect(result.data).toEqual({
            sessionRemainingPct: 60,
            weeklyRemainingPct: 25,
            sessionResetsAtIso: '2026-02-09T00:00:00.000Z',
            weeklyResetsAtIso: '2026-02-12T00:00:00.000Z',
        });
        expect(calls.map((entry) => entry.url)).toEqual([
            claudeProviderConfig.REFRESH_ENDPOINT,
            claudeProviderConfig.USAGE_ENDPOINT,
        ]);
    });

    test('refreshes after usage 401 and retries once', async () => {
        let usageCallCount = 0;

        const provider = createClaudeProvider({
            readTextFile: async () => JSON.stringify({
                claudeAiOauth: {
                    access_token: 'initial-token',
                    refresh_token: 'refresh-token',
                },
            }),
            fetch: async (url, options) => {
                if (url === claudeProviderConfig.USAGE_ENDPOINT) {
                    usageCallCount += 1;

                    if (usageCallCount === 1)
                        return createJsonResponse(401, {});

                    expect(options.headers.authorization).toBe('Bearer retried-token');
                    return createJsonResponse(200, {
                        five_hour: {utilization: 10, resets_at: '2026-02-09T00:00:00.000Z'},
                        seven_day: {utilization: 50, resets_at: '2026-02-12T00:00:00.000Z'},
                    });
                }

                if (url === claudeProviderConfig.REFRESH_ENDPOINT) {
                    return createJsonResponse(200, {
                        access_token: 'retried-token',
                    });
                }

                throw new Error(`Unexpected URL: ${url}`);
            },
        });

        const result = await provider.getUsage();

        expect(result.ok).toBe(true);
        expect(usageCallCount).toBe(2);
        expect(result.data.sessionRemainingPct).toBe(90);
    });

    test('returns auth_expired when refresh is rejected', async () => {
        const provider = createClaudeProvider({
            readTextFile: async () => JSON.stringify({
                claudeAiOauth: {
                    access_token: 'expired',
                    refresh_token: 'bad-refresh',
                    expires_at: new Date(Date.now() - 60_000).toISOString(),
                },
            }),
            fetch: async (url) => {
                if (url === claudeProviderConfig.REFRESH_ENDPOINT)
                    return createJsonResponse(401, {});

                throw new Error(`Unexpected URL: ${url}`);
            },
        });

        const result = await provider.getUsage();

        expect(result.ok).toBe(false);
        expect(result.error.code).toBe('auth_expired');
    });

    test('returns network_error when fetch throws', async () => {
        const provider = createClaudeProvider({
            readTextFile: async () => JSON.stringify({
                claudeAiOauth: {
                    access_token: 'token',
                    refresh_token: 'refresh-token',
                },
            }),
            fetch: async () => {
                throw new Error('network down');
            },
        });

        const result = await provider.getUsage();

        expect(result.ok).toBe(false);
        expect(result.error.code).toBe('network_error');
    });
});
