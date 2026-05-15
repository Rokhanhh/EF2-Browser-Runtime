const TARGET_PROPS = new Set(["currentWave", "waveStartTime"]);

export function installWaveCandidateDetector(onCandidate) {
    const previousDescriptors = new Map();
    const NativeDefineProperty = Object.defineProperty;

    for (const prop of TARGET_PROPS) {
        previousDescriptors.set(prop, Object.getOwnPropertyDescriptor(Object.prototype, prop) || null);
        NativeDefineProperty(Object.prototype, prop, {
            configurable: true,
            enumerable: false,
            set(value) {
                try {
                    NativeDefineProperty(this, prop, {
                        configurable: true,
                        enumerable: true,
                        writable: true,
                        value
                    });
                    onCandidate(this, prop);
                } catch (error) {
                    // Keep runtime stable even if candidate validation/hook fails.
                }
            }
        });
    }

    Object.defineProperty = function patchedDefineProperty(target, prop, descriptor) {
        const result = NativeDefineProperty(target, prop, descriptor);
        if (target && typeof target === "object" && TARGET_PROPS.has(String(prop))) {
            try {
                onCandidate(target, String(prop));
            } catch (error) {
                // Keep runtime stable even if candidate validation/hook fails.
            }
        }
        return result;
    };

    let stopped = false;
    return function stopDetector() {
        if (stopped) {
            return;
        }
        stopped = true;
        Object.defineProperty = NativeDefineProperty;
        for (const prop of TARGET_PROPS) {
            const previous = previousDescriptors.get(prop);
            if (previous) {
                NativeDefineProperty(Object.prototype, prop, previous);
            } else {
                delete Object.prototype[prop];
            }
        }
    };
}
