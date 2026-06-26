import { installObjectPropertyCandidateDetector } from "./property-detector.js";
import { installWaveCandidateDetector } from "./wave-detector.js";

const jsonParseState = {
    nativeParse: null,
    patchedParse: null,
    listeners: new Set()
};

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

export function createHooks() {
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
