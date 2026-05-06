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

        for (const pluginName of Object.keys(plugins)) {
            if (pluginName === "LocalNotifications" || pluginName === "AppsFlyerPlugin") {
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

