import { PROXY_PREFIX, REMOTE_ORIGIN, REMOTE_WS_ORIGIN, WS_PROXY_PREFIX } from "./config.js";

function proxiedUrl(input) {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : null;
    if (!url || !url.startsWith(REMOTE_ORIGIN + "/")) {
        return input;
    }
    const parsed = new URL(url);
    return `${PROXY_PREFIX}${parsed.pathname}${parsed.search}`;
}

function proxiedWebSocketUrl(input) {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : null;
    if (!url || (!url.startsWith(REMOTE_WS_ORIGIN + "/") && url !== REMOTE_WS_ORIGIN)) {
        return input;
    }

    const localScheme = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${localScheme}//${window.location.host}${WS_PROXY_PREFIX}?target=${encodeURIComponent(url)}`;
}

export function installNetworkProxy() {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init) => nativeFetch(proxiedUrl(input), init);

    const NativeWebSocket = window.__EF_NATIVE_WEBSOCKET__ || window.WebSocket;
    if (typeof NativeWebSocket === "function" && !NativeWebSocket.__efPatched) {
        const PatchedWebSocket = function patchedWebSocket(url, protocols) {
            const proxied = proxiedWebSocketUrl(url);
            if (proxied !== url) {
                console.info("[ef-runtime] WebSocket proxied.", { from: url, to: proxied });
            }
            if (protocols === undefined) {
                return new NativeWebSocket(proxied);
            }
            return new NativeWebSocket(proxied, protocols);
        };
        PatchedWebSocket.prototype = NativeWebSocket.prototype;
        PatchedWebSocket.CONNECTING = NativeWebSocket.CONNECTING;
        PatchedWebSocket.OPEN = NativeWebSocket.OPEN;
        PatchedWebSocket.CLOSING = NativeWebSocket.CLOSING;
        PatchedWebSocket.CLOSED = NativeWebSocket.CLOSED;
        PatchedWebSocket.__efPatched = true;
        Object.setPrototypeOf(PatchedWebSocket, NativeWebSocket);
        window.WebSocket = PatchedWebSocket;
        globalThis.WebSocket = PatchedWebSocket;
        if (typeof self === "object") {
            self.WebSocket = PatchedWebSocket;
        }
    }

    const NativeXHR = window.XMLHttpRequest;
    if (typeof NativeXHR !== "function") {
        return;
    }

    const nativeOpen = NativeXHR.prototype.open;
    NativeXHR.prototype.open = function patchedOpen(method, url, ...rest) {
        return nativeOpen.call(this, method, proxiedUrl(url), ...rest);
    };
}

