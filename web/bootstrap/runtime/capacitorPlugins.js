export function installCapacitorPluginShims() {
    const listenerHandle = {
        remove: async () => {},
    };
    const notImplementedPattern = /not implemented on android|plugin is not implemented on android/i;
    const pluginWrapperCache = new Map();
    const warnedPlugins = new Set();

    const shouldSwallowNotImplemented = error => {
        const message =
            error && typeof error === "object" && "message" in error ? String(error.message || "") : String(error || "");
        return notImplementedPattern.test(message);
    };

    const defaultReturnForMethod = methodName => {
        if (methodName === "addListener") return listenerHandle;
        if (methodName === "removeAllListeners") return {};
        if (methodName === "requestPermissions" || methodName === "checkPermissions") return { display: "granted" };
        if (methodName === "getPending" || methodName === "schedule") return { notifications: [] };
        return {};
    };

    const createShimPlugin = (pluginName, overrides) => {
        const base = { ...(overrides || {}) };
        const proxy = new Proxy(base, {
            get(target, prop, receiver) {
                if (prop === "then") return undefined;
                if (prop === "__efSafePluginWrapped") return true;

                const value = Reflect.get(target, prop, receiver);
                if (typeof value === "function") {
                    return async (...args) => value.apply(target, args);
                }
                if (value !== undefined) {
                    return value;
                }
                if (typeof prop !== "string") {
                    return undefined;
                }
                return async () => defaultReturnForMethod(prop);
            },
        });
        pluginWrapperCache.set(pluginName, proxy);
        return proxy;
    };

    const wrapPlugin = (pluginName, plugin) => {
        if (!pluginName || typeof pluginName !== "string") {
            return plugin;
        }
        if (pluginWrapperCache.has(pluginName)) {
            return pluginWrapperCache.get(pluginName);
        }
        if (plugin && plugin.__efSafePluginWrapped) {
            pluginWrapperCache.set(pluginName, plugin);
            return plugin;
        }

        const target = plugin && typeof plugin === "object" ? plugin : {};
        const wrapped = new Proxy(target, {
            get(innerTarget, prop, receiver) {
                if (prop === "then") return undefined;
                if (prop === "__efSafePluginWrapped") return true;
                const value = Reflect.get(innerTarget, prop, receiver);
                if (typeof value !== "function") {
                    return value;
                }
                return async (...args) => {
                    try {
                        return await value.apply(innerTarget, args);
                    } catch (error) {
                        if (shouldSwallowNotImplemented(error)) {
                            if (!warnedPlugins.has(pluginName)) {
                                console.warn(`[ef-runtime] ${pluginName} not implemented in browser runtime; using no-op fallback.`);
                                warnedPlugins.add(pluginName);
                            }
                            return defaultReturnForMethod(String(prop));
                        }
                        throw error;
                    }
                };
            },
        });
        pluginWrapperCache.set(pluginName, wrapped);
        return wrapped;
    };

    const localNotificationsShim = createShimPlugin("LocalNotifications", {
        requestPermissions: async () => ({ display: "granted" }),
        checkPermissions: async () => ({ display: "granted" }),
        schedule: async () => ({ notifications: [] }),
        cancel: async () => ({}),
        getPending: async () => ({ notifications: [] }),
        registerActionTypes: async () => ({}),
        addListener: async () => listenerHandle,
        removeAllListeners: async () => ({}),
    });
    const appsFlyerShim = createShimPlugin("AppsFlyerPlugin", {
        addListener: async () => listenerHandle,
        initSdk: async () => ({}),
        startSdk: async () => ({}),
        logEvent: async () => ({}),
        performOnDeepLinking: async () => ({}),
        getAppsFlyerUID: async () => ({ id: "" }),
    });
    const createAppShim = () => {
        const listeners = new Map();
        const domUnsubscribers = [];
        let initialized = false;
        let hasPushedInitialUrlEvent = false;
        let lastIsActive = document.visibilityState !== "hidden";

        const addEventListener = (eventName, callback) => {
            if (!listeners.has(eventName)) {
                listeners.set(eventName, new Set());
            }
            const set = listeners.get(eventName);
            set.add(callback);
            return {
                remove: async () => {
                    set.delete(callback);
                },
            };
        };

        const emit = (eventName, payload) => {
            const callbacks = listeners.get(eventName);
            if (!callbacks || callbacks.size === 0) {
                return;
            }
            for (const callback of callbacks) {
                try {
                    callback(payload);
                } catch (error) {
                    console.error(`[ef-runtime] App listener error for ${eventName}.`, error);
                }
            }
        };

        const subscribeDom = (target, eventName, handler) => {
            if (!target || typeof target.addEventListener !== "function") {
                return;
            }
            target.addEventListener(eventName, handler);
            domUnsubscribers.push(() => target.removeEventListener(eventName, handler));
        };

        const initializeDomEvents = () => {
            if (initialized) {
                return;
            }
            initialized = true;

            const emitState = isActive => {
                if (isActive === lastIsActive) {
                    return;
                }
                lastIsActive = isActive;
                emit("appStateChange", { isActive });
                emit(isActive ? "resume" : "pause", {});
            };

            subscribeDom(document, "visibilitychange", () => {
                emitState(document.visibilityState !== "hidden");
            });
            subscribeDom(window, "focus", () => emitState(true));
            subscribeDom(window, "blur", () => emitState(false));

            subscribeDom(window, "popstate", () => {
                emit("backButton", { canGoBack: window.history.length > 1 });
            });
            subscribeDom(window, "hashchange", () => {
                emit("appUrlOpen", { url: window.location.href, iosSourceApplication: null, iosOpenInPlace: false });
            });

            const originalPushState = window.history && window.history.pushState ? window.history.pushState.bind(window.history) : null;
            const originalReplaceState = window.history && window.history.replaceState
                ? window.history.replaceState.bind(window.history)
                : null;
            if (originalPushState && !window.__efAppShimPatchedPushState) {
                window.history.pushState = function patchedPushState(...args) {
                    const result = originalPushState(...args);
                    emit("appUrlOpen", { url: window.location.href, iosSourceApplication: null, iosOpenInPlace: false });
                    return result;
                };
                window.__efAppShimPatchedPushState = true;
            }
            if (originalReplaceState && !window.__efAppShimPatchedReplaceState) {
                window.history.replaceState = function patchedReplaceState(...args) {
                    const result = originalReplaceState(...args);
                    emit("appUrlOpen", { url: window.location.href, iosSourceApplication: null, iosOpenInPlace: false });
                    return result;
                };
                window.__efAppShimPatchedReplaceState = true;
            }
        };

        const appShim = {
            addListener: async (eventName, callback) => {
                initializeDomEvents();
                if (typeof callback !== "function") {
                    return listenerHandle;
                }
                const handle = addEventListener(eventName, callback);
                if (eventName === "appUrlOpen" && !hasPushedInitialUrlEvent) {
                    hasPushedInitialUrlEvent = true;
                    window.setTimeout(() => {
                        emit("appUrlOpen", {
                            url: window.location.href,
                            iosSourceApplication: null,
                            iosOpenInPlace: false,
                        });
                    }, 0);
                }
                return handle;
            },
            removeAllListeners: async () => {
                listeners.clear();
                for (const unsubscribe of domUnsubscribers.splice(0)) {
                    try {
                        unsubscribe();
                    } catch (error) {
                        console.warn("[ef-runtime] Failed to remove App shim DOM listener.", error);
                    }
                }
                initialized = false;
                hasPushedInitialUrlEvent = false;
            },
            getState: async () => ({
                isActive: document.visibilityState !== "hidden",
            }),
            getInfo: async () => ({
                name: document.title || "Endless Frontier 2",
                id: "com.ekkorr.ef2.gb.web",
                build: String(window.appBundleVersion || ""),
                version: String(window.appBundleVersion || ""),
            }),
            getLaunchUrl: async () => ({
                url: window.location.href,
            }),
            minimizeApp: async () => ({}),
            exitApp: async () => ({}),
        };
        Object.defineProperty(appShim, "then", {
            value: undefined,
            writable: false,
            configurable: true,
            enumerable: false,
        });
        return appShim;
    };
    const appShim = window.__efAppShim || createAppShim();
    window.__efAppShim = appShim;

    const patchCapacitorInstance = capacitor => {
        if (!capacitor || typeof capacitor !== "object") {
            return;
        }

        if (!capacitor.Plugins || typeof capacitor.Plugins !== "object") {
            capacitor.Plugins = {};
        }
        const plugins = capacitor.Plugins;

        try {
            Object.defineProperty(plugins, "LocalNotifications", {
                get: () => localNotificationsShim,
                set: () => {},
                configurable: true,
                enumerable: true,
            });
        } catch (error) {
            plugins.LocalNotifications = localNotificationsShim;
        }
        try {
            Object.defineProperty(plugins, "AppsFlyerPlugin", {
                get: () => appsFlyerShim,
                set: () => {},
                configurable: true,
                enumerable: true,
            });
        } catch (error) {
            plugins.AppsFlyerPlugin = appsFlyerShim;
        }
        try {
            Object.defineProperty(plugins, "App", {
                get: () => appShim,
                set: () => {},
                configurable: true,
                enumerable: true,
            });
        } catch (error) {
            plugins.App = appShim;
        }

        for (const pluginName of Object.keys(plugins)) {
            if (pluginName === "LocalNotifications" || pluginName === "AppsFlyerPlugin" || pluginName === "App") {
                continue;
            }
            try {
                plugins[pluginName] = wrapPlugin(pluginName, plugins[pluginName]);
            } catch (error) {
                // Keep bootstrap resilient even if a plugin descriptor is read-only.
            }
        }

        if (typeof capacitor.registerPlugin === "function" && !capacitor.__efRegisterPluginPatched) {
            const nativeRegisterPlugin = capacitor.registerPlugin.bind(capacitor);
            capacitor.registerPlugin = (pluginName, jsImplementations) => {
                if (pluginName === "LocalNotifications") {
                    return localNotificationsShim;
                }
                if (pluginName === "AppsFlyerPlugin") {
                    return appsFlyerShim;
                }
                if (pluginName === "App") {
                    return appShim;
                }
                const plugin = nativeRegisterPlugin(pluginName, jsImplementations);
                return wrapPlugin(pluginName, plugin);
            };
            capacitor.__efRegisterPluginPatched = true;
        }
    };

    patchCapacitorInstance(window.Capacitor);

    if (!window.__efCapacitorSetterPatched) {
        let capacitorRef = window.Capacitor;
        Object.defineProperty(window, "Capacitor", {
            get: () => capacitorRef,
            set: value => {
                capacitorRef = value;
                patchCapacitorInstance(capacitorRef);
            },
            configurable: true,
            enumerable: true,
        });
        window.__efCapacitorSetterPatched = true;
    }

    if (!window.__efLocalNotificationsShimIntervalId) {
        let attempts = 0;
        window.__efLocalNotificationsShimIntervalId = window.setInterval(() => {
            attempts += 1;
            patchCapacitorInstance(window.Capacitor);
            if (attempts >= 300) {
                window.clearInterval(window.__efLocalNotificationsShimIntervalId);
                window.__efLocalNotificationsShimIntervalId = null;
            }
        }, 100);
    }
}
