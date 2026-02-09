import {describe, expect, test} from 'bun:test';

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

describe('Codex provider', () => {
    test('returns missing_creds when credentials file is absent', async () => {
        const provider = createCodexProvider({
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
        const provider = createCodexProvider({
            readTextFile: async () => '{not valid json',
            fetch: async () => createJsonResponse(200, {}),
        });

        const result = await provider.getUsage();

        expect(result.ok).toBe(false);
        expect(result.error.code).toBe('parse_error');
    });

    test('fetches usage and normalizes payload with account header', async () => {
        const provider = createCodexProvider({
            readTextFile: async () => JSON.stringify({
                tokens: {
                    access_token: 'access-token',
                    refresh_token: 'refresh-token',
                    account_id: 'acct_123',
                },
            }),
            fetch: async (url, options) => {
                expect(url).toBe(codexProviderConfig.USAGE_ENDPOINT);
                expect(options.method).toBe('GET');
                expect(options.headers.authorization).toBe('Bearer access-token');
                expect(options.headers['ChatGPT-Account-Id']).toBe('acct_123');

                return createJsonResponse(200, {
                    rate_limit: {
                        primary_window: {
                            used_percent: 42,
                            reset_at: 1_770_508_800,
                        },
                        secondary_window: {
                            used_percent: 64,
                            reset_at: 1_770_768_000,
                        },
                    },
                });
            },
        });

        const result = await provider.getUsage();

        expect(result.ok).toBe(true);
        expect(result.data).toEqual({
            sessionRemainingPct: 58,
            weeklyRemainingPct: 36,
            sessionResetsAtIso: '2026-02-08T00:00:00.000Z',
            weeklyResetsAtIso: '2026-02-11T00:00:00.000Z',
        });
    });

    test('refreshes on usage 401 and retries once', async () => {
        let usageCalls = 0;

        const provider = createCodexProvider({
            readTextFile: async () => JSON.stringify({
                tokens: {
                    access_token: 'expired-token',
                    refresh_token: 'refresh-token',
                },
            }),
            fetch: async (url, options) => {
                if (url === codexProviderConfig.USAGE_ENDPOINT) {
                    usageCalls += 1;
                    if (usageCalls === 1)
                        return createJsonResponse(401, {});

                    expect(options.headers.authorization).toBe('Bearer refreshed-token');
                    return createJsonResponse(200, {
                        rate_limit: {
                            primary_window: {used_percent: 10, reset_at: 1_770_508_800},
                            secondary_window: {used_percent: 20, reset_at: 1_770_768_000},
                        },
                    });
                }

                if (url === codexProviderConfig.REFRESH_ENDPOINT) {
                    expect(options.method).toBe('POST');
                    expect(options.headers['content-type']).toBe('application/x-www-form-urlencoded');
                    return createJsonResponse(200, {access_token: 'refreshed-token'});
                }

                throw new Error(`Unexpected URL: ${url}`);
            },
        });

        const result = await provider.getUsage();

        expect(result.ok).toBe(true);
        expect(usageCalls).toBe(2);
        expect(result.data.sessionRemainingPct).toBe(90);
    });

    test('returns partial_data when secondary_window is missing', async () => {
        const provider = createCodexProvider({
            readTextFile: async () => JSON.stringify({
                tokens: {
                    access_token: 'access-token',
                    refresh_token: 'refresh-token',
                },
            }),
            fetch: async () => createJsonResponse(200, {
                rate_limit: {
                    primary_window: {
                        used_percent: 35,
                        reset_at: 1_770_508_800,
                    },
                },
            }),
        });

        const result = await provider.getUsage();

        expect(result.ok).toBe(false);
        expect(result.error.code).toBe('partial_data');
        expect(result.data).toEqual({
            sessionRemainingPct: 65,
            weeklyRemainingPct: 0,
            sessionResetsAtIso: '2026-02-08T00:00:00.000Z',
            weeklyResetsAtIso: null,
        });
    });

    test('returns auth_expired when refresh is rejected', async () => {
        const provider = createCodexProvider({
            readTextFile: async () => JSON.stringify({
                tokens: {
                    access_token: 'bad-token',
                    refresh_token: 'bad-refresh',
                },
            }),
            fetch: async (url) => {
                if (url === codexProviderConfig.USAGE_ENDPOINT)
                    return createJsonResponse(401, {});

                if (url === codexProviderConfig.REFRESH_ENDPOINT)
                    return createJsonResponse(403, {});

                throw new Error(`Unexpected URL: ${url}`);
            },
        });

        const result = await provider.getUsage();

        expect(result.ok).toBe(false);
        expect(result.error.code).toBe('auth_expired');
    });
});
