import { installObjectPropertyCandidateDetector } from "./property-detector.js";
import { installWaveCandidateDetector } from "./wave-detector.js";
import {
    onJsonResponse,
    onRequest,
    onResponse,
    onWebSocketCreate,
    onWebSocketMessage,
    onWebSocketSend
} from "./networkBus.js";

const STORAGE_PREFIX = "__EF_PLUGIN__";
const jsonParseState = {
    nativeParse: null,
    patchedParse: null,
    listeners: new Set()
};

function createLogger() {
    return {
        info(pluginId, message, data) {
            console.info(`[ef-plugin:${pluginId}] ${message}`, data || "");
        },
        warn(pluginId, message, error) {
            console.warn(`[ef-plugin:${pluginId}] ${message}`, error || "");
        },
        error(pluginId, message, error) {
            console.error(`[ef-plugin:${pluginId}] ${message}`, error || "");
        }
    };
}

function storageKey(pluginId, key) {
    return `${STORAGE_PREFIX}:${pluginId}:${key}`;
}

function createStorage() {
    return {
        get(pluginId, key, fallback = null) {
            try {
                const raw = window.localStorage.getItem(storageKey(pluginId, key));
                return raw === null ? fallback : JSON.parse(raw);
            } catch (error) {
                return fallback;
            }
        },
        set(pluginId, key, value) {
            try {
                window.localStorage.setItem(storageKey(pluginId, key), JSON.stringify(value));
                return true;
            } catch (error) {
                return false;
            }
        },
        remove(pluginId, key) {
            try {
                window.localStorage.removeItem(storageKey(pluginId, key));
                return true;
            } catch (error) {
                return false;
            }
        }
    };
}

function createEvents(logger) {
    const listeners = new Map();

    return {
        on(eventName, handler) {
            if (!eventName || typeof handler !== "function") {
                return () => {};
            }
            const key = String(eventName);
            const eventListeners = listeners.get(key) || new Set();
            eventListeners.add(handler);
            listeners.set(key, eventListeners);
            return () => {
                eventListeners.delete(handler);
                if (eventListeners.size === 0) {
                    listeners.delete(key);
                }
            };
        },
        emit(eventName, payload) {
            const eventListeners = listeners.get(String(eventName));
            if (!eventListeners) {
                return;
            }
            for (const handler of Array.from(eventListeners)) {
                try {
                    handler(payload);
                } catch (error) {
                    logger.warn("runtime", `event listener failed: ${eventName}`, error);
                }
            }
        }
    };
}

function createHooks() {
    function ensureJsonParsePatch() {
        if (jsonParseState.patchedParse) {
            return;
        }
        jsonParseState.nativeParse = JSON.parse;
        jsonParseState.patchedParse = function patchedJsonParse(text, reviver) {
            const parsed = jsonParseState.nativeParse(text, reviver);
            for (const listener of Array.from(jsonParseState.listeners)) {
                try {
                    listener(parsed, text, reviver);
                } catch (error) {
                    console.warn("[ef-runtime] JSON.parse hook failed:", error);
                }
            }
            return parsed;
        };
        JSON.parse = jsonParseState.patchedParse;
    }

    function restoreJsonParsePatchIfIdle() {
        if (jsonParseState.listeners.size > 0 || !jsonParseState.patchedParse) {
            return;
        }
        if (JSON.parse === jsonParseState.patchedParse) {
            JSON.parse = jsonParseState.nativeParse;
        }
        jsonParseState.nativeParse = null;
        jsonParseState.patchedParse = null;
    }

    return {
        onObjectWithProperties(props, handler) {
            return installObjectPropertyCandidateDetector(props, handler);
        },
        onWaveController(handler) {
            return installWaveCandidateDetector(handler);
        },
        onJsonParse(handler) {
            if (typeof handler !== "function") {
                return () => {};
            }
            ensureJsonParsePatch();
            jsonParseState.listeners.add(handler);
            return () => {
                jsonParseState.listeners.delete(handler);
                restoreJsonParsePatchIfIdle();
            };
        },
        wrapMethod(object, methodName, wrapper, marker) {
            if (!object || typeof object !== "object" || typeof wrapper !== "function") {
                return () => {};
            }
            const original = object[methodName];
            if (typeof original !== "function" || original[marker]) {
                return () => {};
            }

            const wrapped = wrapper(original);
            if (typeof wrapped !== "function") {
                return () => {};
            }
            if (marker) {
                wrapped[marker] = true;
            }
            object[methodName] = wrapped;

            return () => {
                if (object[methodName] === wrapped) {
                    object[methodName] = original;
                }
            };
        }
    };
}

export function createPluginRuntime({ manifest, version, config } = {}) {
    const logger = createLogger();

    return {
        version,
        manifest,
        config,
        logger,
        storage: createStorage(),
        events: createEvents(logger),
        network: {
            onRequest,
            onResponse,
            onJsonResponse,
            onWebSocketCreate,
            onWebSocketMessage,
            onWebSocketSend
        },
        hooks: createHooks()
    };
}
