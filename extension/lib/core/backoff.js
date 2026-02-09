export const DEFAULT_BACKOFF_INITIAL_DELAY_MS = 30_000;
export const DEFAULT_BACKOFF_MAX_DELAY_MS = 15 * 60_000;

function computeDelayMs(initialDelayMs, maxDelayMs, attempt) {
    const cappedAttempt = Math.max(1, attempt);
    const delay = initialDelayMs * (2 ** (cappedAttempt - 1));
    return Math.min(delay, maxDelayMs);
}

export function createBackoffManager(options = {}) {
    const initialDelayMs = options.initialDelayMs ?? DEFAULT_BACKOFF_INITIAL_DELAY_MS;
    const maxDelayMs = options.maxDelayMs ?? DEFAULT_BACKOFF_MAX_DELAY_MS;
    const nowMs = options.nowMs ?? (() => Date.now());
    const providerStates = new Map();

    function getProviderState(providerName) {
        if (!providerStates.has(providerName)) {
            providerStates.set(providerName, {
                attempt: 0,
                consecutiveNetworkErrors: 0,
                backoffUntilMs: 0,
            });
        }

        return providerStates.get(providerName);
    }

    function scheduleBackoff(providerName) {
        const state = getProviderState(providerName);
        state.attempt += 1;
        const delayMs = computeDelayMs(initialDelayMs, maxDelayMs, state.attempt);
        state.backoffUntilMs = nowMs() + delayMs;
        return delayMs;
    }

    function reset(providerName) {
        const state = getProviderState(providerName);
        state.attempt = 0;
        state.consecutiveNetworkErrors = 0;
        state.backoffUntilMs = 0;
    }

    return {
        shouldBackoff(providerName) {
            const state = getProviderState(providerName);
            return nowMs() < state.backoffUntilMs;
        },
        getBackoffUntilMs(providerName) {
            return getProviderState(providerName).backoffUntilMs;
        },
        recordResult(providerName, result) {
            const state = getProviderState(providerName);
            const code = result?.ok ? null : result?.error?.code;

            if (result?.ok) {
                reset(providerName);
                return;
            }

            if (code === 'rate_limited') {
                state.consecutiveNetworkErrors = 0;
                scheduleBackoff(providerName);
                return;
            }

            if (code === 'network_error') {
                state.consecutiveNetworkErrors += 1;
                if (state.consecutiveNetworkErrors >= 2)
                    scheduleBackoff(providerName);
                return;
            }

            reset(providerName);
        },
    };
}
