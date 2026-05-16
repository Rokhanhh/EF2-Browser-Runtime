import { PROXY_PREFIX, REMOTE_ORIGIN, REMOTE_WS_ORIGIN, WS_PROXY_PREFIX } from "./config.js";

const REBIRTH_TIER_STORAGE_KEY = "__EF_HERO_REBIRTH_MEDAL_TIER_CACHE__";

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

function isGetBatchUrl(url) {
    return typeof url === "string" && url.toLowerCase().includes("getbatch");
}

function resolveBatchVersion(payload) {
    const candidates = [
        payload && payload.version,
        payload && payload.body && payload.body.version,
        payload && payload.body && payload.body.user && payload.body.user.version,
        window.appBundleVersion
    ];
    for (const candidate of candidates) {
        if (typeof candidate === "string" && candidate.trim()) {
            return candidate.trim();
        }
        if (typeof candidate === "number" && Number.isFinite(candidate)) {
            return String(candidate);
        }
    }
    return "unknown";
}

function extractRebirthMedalTierEntries(payload) {
    const body = payload && payload.body;
    if (!Array.isArray(body)) {
        return [];
    }

    const targetBook = body.find((entry) => (
        entry
        && typeof entry === "object"
        && entry.bookName === "HERO_REBIRTH_MEDAL_TIER"
        && Array.isArray(entry.data)
    ));
    if (!targetBook) {
        return [];
    }

    const rows = targetBook.data.filter((row) => row && typeof row === "object");
    if (rows.length > 0 && typeof rows[0].medal === "string") {
        const values = rows[0].medal
            .split("|")
            .map((value) => Number(value))
            .filter((value) => Number.isFinite(value) && value >= 0);
        const entries = values.map((medalValue, index) => [((index + 1) * 10), medalValue]);
        if (entries.length > 0) {
            return entries;
        }
    }

    const medalKeyCandidates = ["medal", "medals", "rewardMedal", "baseMedal", "reward", "value", "amount"];
    const waveKeyCandidates = ["wave", "level", "tier", "stage"];

    let waveKey = null;
    for (const candidate of waveKeyCandidates) {
        const hasCandidate = rows.some((row) => Number.isFinite(Number(row[candidate])));
        if (hasCandidate) {
            waveKey = candidate;
            break;
        }
    }
    if (!waveKey) {
        const numericKeys = new Map();
        for (const row of rows.slice(0, 20)) {
            for (const key of Object.keys(row)) {
                if (Number.isFinite(Number(row[key]))) {
                    numericKeys.set(key, (numericKeys.get(key) || 0) + 1);
                }
            }
        }
        waveKey = Array.from(numericKeys.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    }

    let medalKey = null;
    for (const candidate of medalKeyCandidates) {
        const hasCandidate = rows.some((row) => Number.isFinite(Number(row[candidate])));
        if (hasCandidate) {
            medalKey = candidate;
            break;
        }
    }
    if (!medalKey) {
        const numericKeys = new Map();
        for (const row of rows.slice(0, 20)) {
            for (const key of Object.keys(row)) {
                if (key === waveKey) {
                    continue;
                }
                if (Number.isFinite(Number(row[key]))) {
                    numericKeys.set(key, (numericKeys.get(key) || 0) + 1);
                }
            }
        }
        medalKey = Array.from(numericKeys.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    }

    const waveToMedal = new Map();
    for (const row of rows) {
        if (!row || typeof row !== "object") {
            continue;
        }
        const rawWave = Number(waveKey ? row[waveKey] : NaN);
        if (!Number.isFinite(rawWave) || rawWave <= 0 || rawWave % 10 !== 0) {
            continue;
        }

        let medalValue = NaN;
        if (medalKey) {
            const rawMedal = Number(row[medalKey]);
            if (Number.isFinite(rawMedal) && rawMedal >= 0) {
                medalValue = rawMedal;
            }
        }
        if (!Number.isFinite(medalValue)) {
            for (const candidate of medalKeyCandidates) {
                const rawMedal = Number(row[candidate]);
                if (Number.isFinite(rawMedal) && rawMedal >= 0) {
                    medalValue = rawMedal;
                    break;
                }
            }
        }
        if (!Number.isFinite(medalValue)) {
            continue;
        }

        waveToMedal.set(Math.floor(rawWave), medalValue);
    }

    return Array.from(waveToMedal.entries()).sort((a, b) => a[0] - b[0]);
}

function storeRebirthMedalTier({ payload, sourceUrl }) {
    const sortedEntries = extractRebirthMedalTierEntries(payload);
    if (sortedEntries.length === 0) {
        return;
    }

    const version = resolveBatchVersion(payload);
    const waveToMedal = Object.fromEntries(sortedEntries);

    if (!window.__EF_BATCH_WAVE_MEDALS__) {
        window.__EF_BATCH_WAVE_MEDALS__ = { byVersion: {}, latestVersion: null };
    }

    window.__EF_BATCH_WAVE_MEDALS__.byVersion[version] = {
        version,
        sourceUrl,
        capturedAt: new Date().toISOString(),
        entries: sortedEntries,
        waveToMedal
    };
    window.__EF_BATCH_WAVE_MEDALS__.latestVersion = version;
    window.__EF_HERO_REBIRTH_MEDAL_TIER__ = {
        version,
        sourceUrl,
        capturedAt: new Date().toISOString(),
        entries: sortedEntries,
        waveToMedal
    };

    try {
        window.localStorage.setItem(
            REBIRTH_TIER_STORAGE_KEY,
            JSON.stringify(window.__EF_BATCH_WAVE_MEDALS__)
        );
    } catch (error) {
        // Ignore persistence errors.
    }
}

export function installNetworkProxy() {
    let persistedStore = null;
    try {
        const raw = window.localStorage.getItem(REBIRTH_TIER_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object" && parsed.byVersion && typeof parsed.byVersion === "object") {
                persistedStore = parsed;
            }
        }
    } catch (error) {
        // Ignore restore errors.
    }

    if (!window.__EF_BATCH_WAVE_MEDALS__) {
        window.__EF_BATCH_WAVE_MEDALS__ = persistedStore || { byVersion: {}, latestVersion: null };
    }
    if (!window.__EF_BATCH_WAVE_MEDALS__.latestVersion) {
        const versions = Object.keys(window.__EF_BATCH_WAVE_MEDALS__.byVersion || {});
        if (versions.length > 0) {
            window.__EF_BATCH_WAVE_MEDALS__.latestVersion = versions[versions.length - 1];
        }
    }
    if (!window.__EF_HERO_REBIRTH_MEDAL_TIER__) {
        const latestVersion = window.__EF_BATCH_WAVE_MEDALS__.latestVersion;
        if (latestVersion && window.__EF_BATCH_WAVE_MEDALS__.byVersion[latestVersion]) {
            window.__EF_HERO_REBIRTH_MEDAL_TIER__ = window.__EF_BATCH_WAVE_MEDALS__.byVersion[latestVersion];
        }
    }

    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
        const originalUrl = extractUrl(input);
        const proxied = proxiedUrl(input);
        const response = await nativeFetch(proxied, init);

        if (isGetBatchUrl(originalUrl)) {
            try {
                const cloned = response.clone();
                const text = await cloned.text();
                if (text) {
                    const payload = JSON.parse(text);
                    storeRebirthMedalTier({ payload, sourceUrl: originalUrl });
                }
            } catch (error) {
                // Ignore parse/store errors to keep runtime stable.
            }
        }

        return response;
    };

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
    const nativeSend = NativeXHR.prototype.send;
    NativeXHR.prototype.open = function patchedOpen(method, url, ...rest) {
        this.__efOriginalUrl = extractUrl(url);
        return nativeOpen.call(this, method, proxiedUrl(url), ...rest);
    };

    NativeXHR.prototype.send = function patchedSend(body) {
        this.addEventListener("readystatechange", () => {
            if (this.readyState !== 4) {
                return;
            }
            if (!isGetBatchUrl(this.__efOriginalUrl || "")) {
                return;
            }
            try {
                const text = typeof this.responseText === "string" ? this.responseText : "";
                if (!text) {
                    return;
                }
                const payload = JSON.parse(text);
                storeRebirthMedalTier({ payload, sourceUrl: this.__efOriginalUrl || "" });
            } catch (error) {
                // Ignore parse/store errors to keep runtime stable.
            }
        }, { once: true });
        return nativeSend.call(this, body);
    };
}
