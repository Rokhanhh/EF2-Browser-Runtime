export const runtimePlugins = [];

const LOCAL_PLUGIN_MANIFEST_URL = "/__ef_plugins__/manifest.json";

async function loadLocalPlugins(runtime) {
    let manifest = null;
    try {
        const response = await fetch(LOCAL_PLUGIN_MANIFEST_URL, { cache: "no-store" });
        if (!response.ok) {
            return [];
        }
        manifest = await response.json();
    } catch (error) {
        runtime.logger.warn("runtime", "local plugin manifest unavailable", error);
        return [];
    }

    const descriptors = Array.isArray(manifest?.plugins) ? manifest.plugins : [];
    const plugins = [];
    for (const descriptor of descriptors) {
        if (!descriptor || typeof descriptor !== "object" || typeof descriptor.entry !== "string") {
            continue;
        }
        try {
            const module = await import(descriptor.entry);
            const plugin = module && module.default;
            if (!plugin || typeof plugin.setup !== "function") {
                runtime.logger.warn("runtime", `invalid local plugin: ${descriptor.id || descriptor.entry}`);
                continue;
            }
            plugins.push({
                ...plugin,
                id: plugin.id || descriptor.id,
                name: plugin.name || descriptor.name || plugin.id || descriptor.id,
                handleKey: plugin.handleKey || descriptor.handleKey || null
            });
        } catch (error) {
            runtime.logger.warn("runtime", `local plugin import failed: ${descriptor.id || descriptor.entry}`, error);
        }
    }
    return plugins;
}

export async function installRuntimePlugins(runtime) {
    const handles = {};
    const localPlugins = await loadLocalPlugins(runtime);
    const allPlugins = [...runtimePlugins, ...localPlugins];
    const installedPlugins = [];

    for (const plugin of allPlugins) {
        if (!plugin || !plugin.id || typeof plugin.setup !== "function") {
            continue;
        }
        if (plugin.handleKey && window[plugin.handleKey]) {
            handles[plugin.id] = window[plugin.handleKey];
            installedPlugins.push({
                id: plugin.id,
                name: plugin.name || plugin.id
            });
            continue;
        }

        try {
            const handle = await plugin.setup(runtime);
            handles[plugin.id] = handle || { detach() {} };
            if (plugin.handleKey) {
                window[plugin.handleKey] = handles[plugin.id];
            }
            installedPlugins.push({
                id: plugin.id,
                name: plugin.name || plugin.id
            });
        } catch (error) {
            runtime.logger.warn(plugin.id, "install failed", error);
        }
    }

    handles.__plugins = installedPlugins;
    return handles;
}
