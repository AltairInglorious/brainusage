import {normalizeCodexUsage} from '../core/normalize.js';

const CREDENTIALS_PATH = '~/.codex/auth.json';
const REFRESH_ENDPOINT = 'https://auth.openai.com/oauth/token';
const USAGE_ENDPOINT = 'https://chatgpt.com/backend-api/wham/usage';
const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';

function defaultReadTextFile() {
    throw new Error('readTextFile dependency is required in this runtime');
}

function ok(data) {
    return {ok: true, data};
}

function fail(code, message, data = null) {
    const result = {
        ok: false,
        error: {
            code,
            message,
        },
    };

    if (data)
        result.data = data;

    return result;
}

function mapHttpStatusToErrorCode(status) {
    if (status === 401 || status === 403)
        return 'auth_expired';

    if (status === 404)
        return 'schema_changed';

    if (status === 429)
        return 'rate_limited';

    if (status >= 500 && status < 600)
        return 'network_error';

    return 'network_error';
}

function resolveCredentialsPath(homeDir) {
    if (homeDir && CREDENTIALS_PATH.startsWith('~/'))
        return `${homeDir}${CREDENTIALS_PATH.slice(1)}`;

    return CREDENTIALS_PATH;
}

function parseUsageJson(response) {
    return response.json().catch(() => null);
}

function toUsageHeaders(accessToken, accountId) {
    const headers = {
        authorization: `Bearer ${accessToken}`,
    };

    if (accountId)
        headers['ChatGPT-Account-Id'] = accountId;

    return headers;
}

async function fetchUsage(fetchImpl, accessToken, accountId) {
    const response = await fetchImpl(USAGE_ENDPOINT, {
        method: 'GET',
        headers: toUsageHeaders(accessToken, accountId),
    });

    if (!response.ok)
        return fail(mapHttpStatusToErrorCode(response.status), `Usage request failed with status ${response.status}`);

    const payload = await parseUsageJson(response);
    if (!payload)
        return fail('schema_changed', 'Usage endpoint returned invalid JSON');

    return ok(payload);
}

async function refreshAccessToken(fetchImpl, refreshToken) {
    if (!refreshToken)
        return fail('auth_expired', 'OAuth refresh token is missing');

    const body = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: CODEX_CLIENT_ID,
        refresh_token: refreshToken,
    });

    const response = await fetchImpl(REFRESH_ENDPOINT, {
        method: 'POST',
        headers: {
            'content-type': 'application/x-www-form-urlencoded',
        },
        body,
    });

    if (!response.ok)
        return fail(mapHttpStatusToErrorCode(response.status), `Refresh request failed with status ${response.status}`);

    const payload = await response.json().catch(() => null);
    if (!payload)
        return fail('schema_changed', 'Refresh endpoint returned invalid JSON');

    const accessToken = payload?.access_token;

    if (!accessToken)
        return fail('auth_expired', 'Refresh response did not include an access token');

    return ok({accessToken});
}

function readTokenBundle(credentials) {
    const tokens = credentials?.tokens;
    return {
        accessToken: tokens?.access_token ?? null,
        refreshToken: tokens?.refresh_token ?? null,
        accountId: tokens?.account_id ?? null,
    };
}

export function createCodexProvider(options = {}) {
    const fetchImpl = options.fetch ?? globalThis.fetch;
    const readTextFile = options.readTextFile ?? defaultReadTextFile;
    const homeDir = options.homeDir ?? globalThis.process?.env?.HOME ?? null;
    const credentialsPath = resolveCredentialsPath(homeDir);

    return {
        async getUsage() {
            if (typeof fetchImpl !== 'function')
                return fail('network_error', 'Fetch implementation is unavailable');

            let raw;
            try {
                raw = await readTextFile(credentialsPath);
            } catch {
                return fail('missing_creds', `Missing credentials at ${credentialsPath}`);
            }

            if (!raw)
                return fail('missing_creds', `Missing credentials at ${credentialsPath}`);

            let parsed;
            try {
                parsed = JSON.parse(raw);
            } catch {
                return fail('parse_error', 'Unable to parse Codex credentials JSON');
            }

            const {accessToken: initialAccessToken, refreshToken, accountId} = readTokenBundle(parsed);

            if (!initialAccessToken && !refreshToken)
                return fail('missing_creds', 'Missing tokens.access_token and tokens.refresh_token in credentials JSON');

            let accessToken = initialAccessToken;

            try {
                if (!accessToken) {
                    const refreshed = await refreshAccessToken(fetchImpl, refreshToken);
                    if (!refreshed.ok)
                        return refreshed;

                    accessToken = refreshed.data.accessToken;
                }

                let usage = await fetchUsage(fetchImpl, accessToken, accountId);
                if (!usage.ok && usage.error.code === 'auth_expired') {
                    const refreshed = await refreshAccessToken(fetchImpl, refreshToken);
                    if (!refreshed.ok)
                        return refreshed;

                    usage = await fetchUsage(fetchImpl, refreshed.data.accessToken, accountId);
                }

                if (!usage.ok)
                    return usage;

                const normalized = normalizeCodexUsage(usage.data);
                if (!normalized.hasPrimaryWindow && !normalized.hasSecondaryWindow)
                    return fail('schema_changed', 'Usage payload is missing expected rate_limit windows');

                if (normalized.hasPartialData)
                    return fail('partial_data', 'Usage payload is missing primary_window or secondary_window', normalized.data);

                return ok(normalized.data);
            } catch {
                return fail('network_error', 'Network request failed while calling Codex APIs');
            }
        },
    };
}

export const codexProviderConfig = {
    CREDENTIALS_PATH,
    REFRESH_ENDPOINT,
    USAGE_ENDPOINT,
    CODEX_CLIENT_ID,
};
