const listeners = {
    request: new Set(),
    response: new Set(),
    jsonResponse: new Set(),
    webSocketCreate: new Set(),
    webSocketMessage: new Set(),
    webSocketSend: new Set()
};

function normalizeSubscriptionArgs(optionsOrHandler, maybeHandler) {
    if (typeof optionsOrHandler === "function") {
        return { options: {}, handler: optionsOrHandler };
    }
    return {
        options: optionsOrHandler && typeof optionsOrHandler === "object" ? optionsOrHandler : {},
        handler: maybeHandler
    };
}

function valueMatchesExpected(value, expected) {
    if (expected === undefined || expected === null) {
        return true;
    }
    if (Array.isArray(expected)) {
        return expected.some((item) => valueMatchesExpected(value, item));
    }
    return String(value || "").toLowerCase() === String(expected).toLowerCase();
}

function urlMatchesIncludes(url, urlIncludes) {
    if (urlIncludes === undefined || urlIncludes === null) {
        return true;
    }
    const normalizedUrl = String(url || "").toLowerCase();
    const candidates = Array.isArray(urlIncludes) ? urlIncludes : [urlIncludes];
    return candidates.some((candidate) => normalizedUrl.includes(String(candidate || "").toLowerCase()));
}

function matchesOptions(event, options) {
    if (!event || !options) {
        return true;
    }
    if (!valueMatchesExpected(event.type, options.type)) {
        return false;
    }
    if (!valueMatchesExpected(event.method, options.method)) {
        return false;
    }
    if (!urlMatchesIncludes(event.url, options.urlIncludes)) {
        return false;
    }
    if (options.urlPattern instanceof RegExp && !options.urlPattern.test(String(event.url || ""))) {
        return false;
    }
    if (typeof options.filter === "function") {
        return options.filter(event) === true;
    }
    return true;
}

function subscribe(type, optionsOrHandler, maybeHandler) {
    const { options, handler } = normalizeSubscriptionArgs(optionsOrHandler, maybeHandler);
    if (!listeners[type] || typeof handler !== "function") {
        return () => {};
    }
    const subscription = { options, handler };
    listeners[type].add(subscription);
    return () => {
        listeners[type].delete(subscription);
    };
}

async function notify(type, event) {
    const targetListeners = listeners[type];
    if (!targetListeners || targetListeners.size === 0) {
        return;
    }

    let readonlyEvent = null;
    for (const subscription of Array.from(targetListeners)) {
        if (!matchesOptions(event, subscription.options)) {
            continue;
        }
        if (!readonlyEvent) {
            readonlyEvent = Object.freeze({ ...event });
        }
        try {
            await subscription.handler(readonlyEvent);
        } catch (error) {
            console.warn(`[ef-runtime] network ${type} listener failed:`, error);
        }
    }
}

export function hasMatchingListeners(type, event) {
    const targetListeners = listeners[type];
    if (!targetListeners || targetListeners.size === 0) {
        return false;
    }
    return Array.from(targetListeners).some((subscription) => matchesOptions(event, subscription.options));
}

function deepFreeze(value, seen = new Set()) {
    if (!value || typeof value !== "object" || seen.has(value)) {
        return value;
    }
    seen.add(value);
    Object.freeze(value);
    for (const key of Object.keys(value)) {
        deepFreeze(value[key], seen);
    }
    return value;
}

export function onRequest(optionsOrHandler, maybeHandler) {
    return subscribe("request", optionsOrHandler, maybeHandler);
}

export function onResponse(optionsOrHandler, maybeHandler) {
    return subscribe("response", optionsOrHandler, maybeHandler);
}

export function onJsonResponse(optionsOrHandler, maybeHandler) {
    return subscribe("jsonResponse", optionsOrHandler, maybeHandler);
}

export function onWebSocketCreate(optionsOrHandler, maybeHandler) {
    return subscribe("webSocketCreate", optionsOrHandler, maybeHandler);
}

export function onWebSocketMessage(optionsOrHandler, maybeHandler) {
    return subscribe("webSocketMessage", optionsOrHandler, maybeHandler);
}

export function onWebSocketSend(optionsOrHandler, maybeHandler) {
    return subscribe("webSocketSend", optionsOrHandler, maybeHandler);
}

export function createBodyReaders({ text = null, response = null } = {}) {
    let textRead = false;
    let textValue = "";
    let jsonRead = false;
    let jsonValue = null;

    async function readText() {
        if (!textRead) {
            if (typeof text === "string") {
                textValue = text;
            } else if (response && typeof response.text === "function") {
                textValue = await response.text();
            } else {
                textValue = "";
            }
            textRead = true;
        }
        return textValue;
    }

    async function readJson() {
        if (!jsonRead) {
            const raw = await readText();
            jsonValue = raw ? deepFreeze(JSON.parse(raw)) : null;
            jsonRead = true;
        }
        return jsonValue;
    }

    return Object.freeze({ readText, readJson });
}

export async function notifyRequest(event) {
    await notify("request", event);
}

export async function notifyResponse(event) {
    await notify("response", event);
}

export async function notifyJsonResponse(event) {
    await notify("jsonResponse", event);
}

export async function notifyWebSocketCreate(event) {
    await notify("webSocketCreate", event);
}

export async function notifyWebSocketMessage(event) {
    await notify("webSocketMessage", event);
}

export async function notifyWebSocketSend(event) {
    await notify("webSocketSend", event);
}
