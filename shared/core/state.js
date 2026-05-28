export const PROVIDER_STATE_CODES = {
    OK: 'OK',
    PARTIAL_DATA: 'PARTIAL_DATA',
    AUTH_EXPIRED: 'AUTH_EXPIRED',
    RATE_LIMITED: 'RATE_LIMITED',
    NETWORK_ERROR: 'NETWORK_ERROR',
    SCHEMA_CHANGED: 'SCHEMA_CHANGED',
};

const ERROR_CODE_MAP = {
    partial_data: PROVIDER_STATE_CODES.PARTIAL_DATA,
    auth_expired: PROVIDER_STATE_CODES.AUTH_EXPIRED,
    rate_limited: PROVIDER_STATE_CODES.RATE_LIMITED,
    network_error: PROVIDER_STATE_CODES.NETWORK_ERROR,
    schema_changed: PROVIDER_STATE_CODES.SCHEMA_CHANGED,
    parse_error: PROVIDER_STATE_CODES.SCHEMA_CHANGED,
};

function toMappedCode(result) {
    if (result?.ok)
        return PROVIDER_STATE_CODES.OK;

    const mapped = ERROR_CODE_MAP[result?.error?.code];
    if (mapped)
        return mapped;

    return PROVIDER_STATE_CODES.SCHEMA_CHANGED;
}

export function createProviderState(name) {
    return {
        name,
        inFlight: false,
        latestRequestedRequestId: 0,
        latestAppliedRequestId: 0,
        code: null,
        data: null,
        error: null,
        lastUpdatedAtIso: null,
        queue: Promise.resolve(),
    };
}

export function applyProviderResult(state, result, requestId, updatedAtIso) {
    if (requestId < state.latestAppliedRequestId)
        return false;

    state.latestAppliedRequestId = requestId;
    state.code = toMappedCode(result);
    state.lastUpdatedAtIso = updatedAtIso;

    if (result?.ok) {
        state.data = result.data ?? null;
        state.error = null;
        return true;
    }

    state.data = result?.data ?? null;
    state.error = {
        code: state.code,
        providerCode: result?.error?.code ?? null,
        message: result?.error?.message ?? null,
    };

    return true;
}

export function snapshotProviderState(state) {
    return {
        code: state.code,
        data: state.data,
        error: state.error,
        inFlight: state.inFlight,
        lastUpdatedAtIso: state.lastUpdatedAtIso,
    };
}
