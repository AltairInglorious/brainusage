import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

function normalizeHeaders(headers) {
    if (!headers || typeof headers !== 'object')
        return [];

    return Object.entries(headers).map(([name, value]) => [name, String(value)]);
}

function resolveBody(options) {
    const body = options?.body;
    if (body === undefined || body === null)
        return null;

    if (typeof body === 'string')
        return body;

    if (body instanceof URLSearchParams)
        return body.toString();

    if (body instanceof Uint8Array)
        return body;

    return String(body);
}

function getContentType(headers) {
    const normalized = normalizeHeaders(headers);

    for (const [name, value] of normalized) {
        if (name.toLowerCase() === 'content-type')
            return value;
    }

    return 'application/octet-stream';
}

function createResponse(status, bytes) {
    let textCache = null;

    async function text() {
        if (textCache !== null)
            return textCache;

        textCache = new TextDecoder().decode(bytes.toArray());
        return textCache;
    }

    return {
        ok: status >= 200 && status < 300,
        status,
        async text() {
            return text();
        },
        async json() {
            return JSON.parse(await text());
        },
    };
}

export function createFetch() {
    const session = new Soup.Session();

    function sendMessage(message) {
        return new Promise((resolve, reject) => {
            session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null, (source, result) => {
                try {
                    const bytes = source.send_and_read_finish(result);
                    resolve(bytes);
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    async function fetch(url, options = {}) {
        const method = options.method ?? 'GET';
        const message = Soup.Message.new(method, url);

        if (!message)
            throw new Error(`Invalid URL: ${url}`);

        for (const [name, value] of normalizeHeaders(options.headers))
            message.request_headers.append(name, value);

        const body = resolveBody(options);
        if (body !== null) {
            const bytes = body instanceof Uint8Array
                ? new GLib.Bytes(body)
                : new GLib.Bytes(new TextEncoder().encode(body));

            message.set_request_body_from_bytes(getContentType(options.headers), bytes);
        }

        const bytes = await sendMessage(message);
        return createResponse(message.get_status(), bytes);
    }

    function dispose() {
        session.abort();
    }

    return {fetch, dispose};
}
