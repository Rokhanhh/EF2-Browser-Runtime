import {
    PROXY_PREFIX,
    REMOTE_ORIGIN,
    REMOTE_WS_ORIGIN,
    RUNTIME_TOKEN,
    RUNTIME_TOKEN_HEADER,
    RUNTIME_WS_TOKEN_PROTOCOL_PREFIX,
    WS_PROXY_PREFIX
} from "./config.js";
import {
    createBodyReaders,
    hasMatchingListeners,
    notifyJsonResponse,
    notifyRequest,
    notifyResponse,
    notifyWebSocketCreate,
    notifyWebSocketMessage,
    notifyWebSocketSend
} from "./plugin-api/networkNotifier.js";

function proxiedUrl(input) {
    let url = null;
    if (typeof input === "string") {
        url = input;
    } else if (input instanceof URL) {
        url = input.href;
    } else if (typeof Request === "function" && input instanceof Request) {
        url = input.url;
    }
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

function runtimeWebSocketProtocols(protocols) {
    if (!RUNTIME_TOKEN) {
        return protocols;
    }
    const tokenProtocol = `${RUNTIME_WS_TOKEN_PROTOCOL_PREFIX}${RUNTIME_TOKEN}`;
    const originalProtocols = Array.isArray(protocols)
        ? protocols
        : typeof protocols === "string"
            ? [protocols]
            : [];
    return [
        tokenProtocol,
        ...originalProtocols.filter(protocol => !String(protocol).startsWith(RUNTIME_WS_TOKEN_PROTOCOL_PREFIX))
    ];
}

function extractUrl(input) {
    if (typeof input === "string") {
        return input;
    }
    if (input instanceof URL) {
        return input.href;
    }
    if (input && typeof input === "object" && typeof input.url === "string") {
        return input.url;
    }
    return "";
}

function extractMethod(input, init) {
    if (init && typeof init.method === "string") {
        return init.method.toUpperCase();
    }
    if (input && typeof input === "object" && typeof input.method === "string") {
        return input.method.toUpperCase();
    }
    return "GET";
}

async function buildProxiedFetchRequest(input, init, proxied) {
    const effectiveRequest = new Request(input, init);
    const headers = new Headers(effectiveRequest.headers);
    headers.set(RUNTIME_TOKEN_HEADER, RUNTIME_TOKEN);
    const proxyInit = {
        method: effectiveRequest.method,
        headers,
        credentials: effectiveRequest.credentials,
        mode: effectiveRequest.mode,
        cache: effectiveRequest.cache,
        redirect: effectiveRequest.redirect,
        referrer: effectiveRequest.referrer,
        referrerPolicy: effectiveRequest.referrerPolicy,
        integrity: effectiveRequest.integrity,
        keepalive: effectiveRequest.keepalive,
        signal: effectiveRequest.signal
    };

    if (effectiveRequest.body !== null && !["GET", "HEAD"].includes(effectiveRequest.method)) {
        // Chromium requires HTTP/2 for streaming uploads. The local runtime speaks
        // HTTP/1.1, so materialize the body and let fetch send a fixed Content-Length.
        proxyInit.body = await effectiveRequest.arrayBuffer();
    }

    return new Request(proxied, proxyInit);
}

function snapshotHeaders(headers) {
    if (!headers || typeof headers.forEach !== "function") {
        return Object.freeze({});
    }
    const snapshot = {};
    try {
        headers.forEach((value, key) => {
            snapshot[key] = value;
        });
    } catch (error) {
        return Object.freeze({});
    }
    return Object.freeze(snapshot);
}

function snapshotProtocols(protocols) {
    if (Array.isArray(protocols)) {
        return Object.freeze(protocols.slice());
    }
    if (typeof protocols === "string") {
        return protocols;
    }
    return null;
}

function snapshotWebSocketData(data) {
    if (typeof data === "string") {
        return data;
    }
    if (data instanceof ArrayBuffer) {
        return data.slice(0);
    }
    if (ArrayBuffer.isView(data)) {
        return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    }
    if (typeof Blob !== "undefined" && data instanceof Blob) {
        return data.slice(0, data.size, data.type);
    }
    return null;
}

function installSocketObservers(socket, { url, proxied, protocols }) {
    notifyWebSocketCreate({
        type: "websocket",
        url,
        proxiedUrl: proxied,
        protocols: snapshotProtocols(protocols)
    });

    if (socket && typeof socket.addEventListener === "function") {
        socket.addEventListener("message", (event) => {
            notifyWebSocketMessage({
                type: "websocket",
                url,
                proxiedUrl: proxied,
                data: snapshotWebSocketData(event.data)
            });
        });
    }

    if (socket && typeof socket.send === "function" && !socket.__efSendObserved) {
        try {
            const nativeSend = socket.send;
            socket.send = function observedSend(data) {
                notifyWebSocketSend({
                    type: "websocket",
                    url,
                    proxiedUrl: proxied,
                    data: snapshotWebSocketData(data)
                });
                return nativeSend.call(this, data);
            };
            socket.__efSendObserved = true;
        } catch (error) {
            // Sending still works; only plugin observation is unavailable.
        }
    }
}

export function installNetworkProxy() {
    if (window.__EF_NETWORK_PROXY_INSTALLED__) {
        return;
    }
    window.__EF_NETWORK_PROXY_INSTALLED__ = true;

    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
        const originalUrl = extractUrl(input);
        const proxied = proxiedUrl(input);
        const method = extractMethod(input, init);
        let fetchInput = proxied;
        let fetchInit = init;

        notifyRequest({
            type: "fetch",
            method,
            url: originalUrl,
            proxiedUrl: typeof proxied === "string" ? proxied : extractUrl(proxied)
        });

        if (proxied !== input && typeof proxied === "string") {
            fetchInput = await buildProxiedFetchRequest(input, init, proxied);
            fetchInit = undefined;
        }

        const response = await nativeFetch(fetchInput, fetchInit);
        const baseResponseEvent = {
            type: "fetch",
            method,
            url: originalUrl,
            proxiedUrl: typeof proxied === "string" ? proxied : extractUrl(proxied),
            status: response.status,
            ok: response.ok,
            headers: snapshotHeaders(response.headers)
        };
        const needsResponseEvent = hasMatchingListeners("response", baseResponseEvent);
        const needsJsonResponseEvent = hasMatchingListeners("jsonResponse", baseResponseEvent);

        if (needsResponseEvent || needsJsonResponseEvent) {
            const responseClone = response.clone();
            const readers = createBodyReaders({ response: responseClone });
            const responseEvent = {
                ...baseResponseEvent,
                readText: readers.readText,
                readJson: readers.readJson
            };
            if (needsResponseEvent) {
                notifyResponse(responseEvent);
            }
            if (needsJsonResponseEvent) {
                notifyJsonResponse(responseEvent);
            }
        }

        return response;
    };

    const NativeWebSocket = window.__EF_NATIVE_WEBSOCKET__ || window.WebSocket;
    if (typeof NativeWebSocket === "function" && !NativeWebSocket.__efPatched) {
        const PatchedWebSocket = function patchedWebSocket(url, protocols) {
            const proxied = proxiedWebSocketUrl(url);
            const nativeProtocols = proxied !== url ? runtimeWebSocketProtocols(protocols) : protocols;
            if (proxied !== url) {
                console.info("[ef-runtime] WebSocket proxied.", { from: url, to: proxied });
            }
            const socket = nativeProtocols === undefined
                ? new NativeWebSocket(proxied)
                : new NativeWebSocket(proxied, nativeProtocols);
            installSocketObservers(socket, { url: extractUrl(url) || String(url || ""), proxied, protocols });
            return socket;
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
    const nativeSend = NativeXHR.prototype.send;
    const nativeSetRequestHeader = NativeXHR.prototype.setRequestHeader;
    NativeXHR.prototype.open = function patchedOpen(method, url, ...rest) {
        this.__efOriginalMethod = String(method || "GET").toUpperCase();
        this.__efOriginalUrl = extractUrl(url);
        const proxied = proxiedUrl(url);
        this.__efProxiedUrl = typeof proxied === "string" ? proxied : extractUrl(proxied);
        this.__efUsesRuntimeProxy = proxied !== url;
        return nativeOpen.call(this, method, proxied, ...rest);
    };

    NativeXHR.prototype.send = function patchedSend(body) {
        const method = this.__efOriginalMethod || "GET";
        const originalUrl = this.__efOriginalUrl || "";
        const proxiedUrl = this.__efProxiedUrl || "";

        notifyRequest({
            type: "xhr",
            method,
            url: originalUrl,
            proxiedUrl
        });

        if (this.__efUsesRuntimeProxy) {
            nativeSetRequestHeader.call(this, RUNTIME_TOKEN_HEADER, RUNTIME_TOKEN);
        }

        const handleLoadEnd = () => {
            if (this.readyState !== 4) {
                return;
            }
            let text = "";
            const baseResponseEvent = {
                type: "xhr",
                method,
                url: originalUrl,
                proxiedUrl,
                status: this.status,
                ok: this.status >= 200 && this.status < 300
            };
            const needsResponseEvent = hasMatchingListeners("response", baseResponseEvent);
            const needsJsonResponseEvent = hasMatchingListeners("jsonResponse", baseResponseEvent);
            if (!needsResponseEvent && !needsJsonResponseEvent) {
                return;
            }
            try {
                text = typeof this.responseText === "string" ? this.responseText : "";
            } catch (error) {
                text = "";
            }
            const readers = createBodyReaders({ text });
            const responseEvent = {
                ...baseResponseEvent,
                responseText: text,
                readText: readers.readText,
                readJson: readers.readJson
            };
            if (needsResponseEvent) {
                notifyResponse(responseEvent);
            }
            if (needsJsonResponseEvent) {
                notifyJsonResponse(responseEvent);
            }
        };

        this.addEventListener("loadend", handleLoadEnd, { once: true });
        try {
            return nativeSend.call(this, body);
        } catch (error) {
            this.removeEventListener("loadend", handleLoadEnd);
            throw error;
        }
    };
}
