export function readBooleanPreference(key, fallback = false) {
    try {
        const value = window.localStorage.getItem(key);
        return value === null ? fallback : value === "true";
    } catch (error) {
        return fallback;
    }
}

export function writeBooleanPreference(key, value) {
    try {
        window.localStorage.setItem(key, value ? "true" : "false");
    } catch (error) {
        // Ignore storage errors.
    }
}
