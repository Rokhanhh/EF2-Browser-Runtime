const detectorState = {
    nativeDefineProperty: null,
    patchedDefineProperty: null,
    observedProps: new Map()
};

function getObservedEntry(prop) {
    return detectorState.observedProps.get(String(prop)) || null;
}

function notifyCandidate(target, prop) {
    const entry = getObservedEntry(prop);
    if (!entry || !target || typeof target !== "object") {
        return;
    }

    for (const listener of Array.from(entry.listeners)) {
        try {
            listener(target, String(prop));
        } catch (error) {
            // Detection should not affect the game runtime.
        }
    }
}

function ensureDefinePropertyPatch() {
    if (detectorState.patchedDefineProperty) {
        return;
    }

    detectorState.nativeDefineProperty = Object.defineProperty;
    detectorState.patchedDefineProperty = function patchedDefineProperty(target, prop, descriptor) {
        const result = detectorState.nativeDefineProperty(target, prop, descriptor);
        if (getObservedEntry(prop)) {
            notifyCandidate(target, String(prop));
        }
        return result;
    };

    Object.defineProperty = detectorState.patchedDefineProperty;
}

function restoreDefinePropertyPatchIfIdle() {
    if (detectorState.observedProps.size > 0 || !detectorState.patchedDefineProperty) {
        return;
    }

    if (Object.defineProperty === detectorState.patchedDefineProperty) {
        Object.defineProperty = detectorState.nativeDefineProperty;
    }
    detectorState.nativeDefineProperty = null;
    detectorState.patchedDefineProperty = null;
}

function observeProp(prop) {
    const key = String(prop);
    const existing = detectorState.observedProps.get(key);
    if (existing) {
        return existing;
    }

    const nativeDefineProperty = detectorState.nativeDefineProperty;
    const entry = {
        previousDescriptor: Object.getOwnPropertyDescriptor(Object.prototype, key) || null,
        listeners: new Set()
    };

    nativeDefineProperty(Object.prototype, key, {
        configurable: true,
        enumerable: false,
        set(value) {
            try {
                nativeDefineProperty(this, key, {
                    configurable: true,
                    enumerable: true,
                    writable: true,
                    value
                });
                notifyCandidate(this, key);
            } catch (error) {
                // Keep runtime stable even if candidate capture fails.
            }
        }
    });

    detectorState.observedProps.set(key, entry);
    return entry;
}

function unobservePropIfIdle(prop) {
    const key = String(prop);
    const entry = detectorState.observedProps.get(key);
    if (!entry || entry.listeners.size > 0) {
        return;
    }

    const nativeDefineProperty = detectorState.nativeDefineProperty;
    detectorState.observedProps.delete(key);
    if (entry.previousDescriptor) {
        nativeDefineProperty(Object.prototype, key, entry.previousDescriptor);
    } else {
        delete Object.prototype[key];
    }
}

export function installObjectPropertyCandidateDetector(targetProps, onCandidate) {
    if (!Array.isArray(targetProps) || targetProps.length === 0 || typeof onCandidate !== "function") {
        return () => {};
    }

    ensureDefinePropertyPatch();

    const props = Array.from(new Set(targetProps.map(String).filter(Boolean)));
    for (const prop of props) {
        observeProp(prop).listeners.add(onCandidate);
    }

    let stopped = false;
    return function stopDetector() {
        if (stopped) {
            return;
        }
        stopped = true;

        for (const prop of props) {
            const entry = getObservedEntry(prop);
            if (entry) {
                entry.listeners.delete(onCandidate);
                unobservePropIfIdle(prop);
            }
        }

        restoreDefinePropertyPatchIfIdle();
    };
}
