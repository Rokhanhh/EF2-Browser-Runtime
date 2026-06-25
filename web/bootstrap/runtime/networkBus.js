const listeners = {
    request: new Set(),
    response: new Set(),
    jsonResponse: new Set(),
    webSocketCreate: new Set(),
    webSocketMessage: new Set(),
    webSocketSend: new Set()
};

function subscribe(type, handler) {
    if (!listeners[type] || typeof handler !== "function") {
        return () => {};
    }
    listeners[type].add(handler);
    return () => {
        listeners[type].delete(handler);
    };
}

async function notify(type, event) {
    const targetListeners = listeners[type];
    if (!targetListeners || targetListeners.size === 0) {
        return;
    }

    const readonlyEvent = Object.freeze({ ...event });
    for (const handler of Array.from(targetListeners)) {
        try {
            await handler(readonlyEvent);
        } catch (error) {
            console.warn(`[ef-runtime] network ${type} listener failed:`, error);
        }
    }
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

export function onRequest(handler) {
    return subscribe("request", handler);
}

export function onResponse(handler) {
    return subscribe("response", handler);
}

export function onJsonResponse(handler) {
    return subscribe("jsonResponse", handler);
}

export function onWebSocketCreate(handler) {
    return subscribe("webSocketCreate", handler);
}

export function onWebSocketMessage(handler) {
    return subscribe("webSocketMessage", handler);
}

export function onWebSocketSend(handler) {
    return subscribe("webSocketSend", handler);
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
