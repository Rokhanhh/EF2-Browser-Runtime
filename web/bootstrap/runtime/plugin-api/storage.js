const STORAGE_PREFIX = "__EF_PLUGIN__";

function storageKey(pluginId, key) {
    return `${STORAGE_PREFIX}:${pluginId}:${key}`;
}

export function createStorage() {
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
