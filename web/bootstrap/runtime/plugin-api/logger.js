export function createLogger() {
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
