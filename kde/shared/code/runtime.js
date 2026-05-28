.pragma library

// Network runtime for the KDE plasmoid: HTTP backed by the QML engine's
// XMLHttpRequest. This satisfies the `fetch` dependency-injection contract
// the shared providers expect, mirroring the GNOME Soup adapter.
//
// Local file reads are NOT done here: XHR file:// access is deprecated and
// disabled by default on newer Qt. Credentials are read via the Plasma
// "executable" DataSource instead (see ExecReader.qml).
//
// This is a classic QML JS library (no ES imports) so it can freely use the
// engine-global XMLHttpRequest. It is imported into QML and its function is
// passed into the bundled core via createApp().

function _buildResponse(status, bodyText) {
    return {
        ok: status >= 200 && status < 300,
        status: status,
        text: function () { return Promise.resolve(bodyText); },
        json: function () { return Promise.resolve(JSON.parse(bodyText)); }
    };
}

// fetch(url, {method, headers, body}) -> Promise<{ok, status, text(), json()}>
function xhrFetch(url, options) {
    options = options || {};
    return new Promise(function (resolve, reject) {
        try {
            var xhr = new XMLHttpRequest();
            xhr.open(options.method || 'GET', url, true);

            var headers = options.headers || {};
            for (var name in headers) {
                if (Object.prototype.hasOwnProperty.call(headers, name))
                    xhr.setRequestHeader(name, String(headers[name]));
            }

            xhr.onreadystatechange = function () {
                if (xhr.readyState !== XMLHttpRequest.DONE)
                    return;
                resolve(_buildResponse(xhr.status, xhr.responseText));
            };
            xhr.onerror = function () { reject(new Error('XHR network error: ' + url)); };

            var body = options.body;
            if (body === undefined || body === null)
                xhr.send();
            else
                xhr.send(typeof body === 'string' ? body : String(body));
        } catch (e) {
            reject(e);
        }
    });
}
