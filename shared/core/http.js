// Encode a flat object as an application/x-www-form-urlencoded body string.
//
// Used by the OAuth refresh requests. We build the string explicitly instead
// of relying on URLSearchParams so the shared core stays portable: the KDE
// plasmoid runs on Qt 5.15's QML engine, which does not provide
// URLSearchParams. Soup (GNOME) and the XHR adapter (KDE) both accept a string
// body, so this works unchanged on both platforms.
export function encodeForm(params) {
    return Object.keys(params)
        .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
        .join('&');
}
