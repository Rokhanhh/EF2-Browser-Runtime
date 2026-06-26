export function createEvents(logger) {
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
