import { createEvents } from "./events.js";
import { createHooks } from "./hooks.js";
import { createLogger } from "./logger.js";
import {
    onJsonResponse,
    onRequest,
    onResponse,
    onWebSocketCreate,
    onWebSocketMessage,
    onWebSocketSend
} from "./network.js";
import { createStorage } from "./storage.js";

export function createPluginRuntime({ manifest, version, config } = {}) {
    const logger = createLogger();

    return {
        version,
        manifest,
        config,
        logger,
        storage: createStorage(),
        events: createEvents(logger),
        network: {
            onRequest,
            onResponse,
            onJsonResponse,
            onWebSocketCreate,
            onWebSocketMessage,
            onWebSocketSend
        },
        hooks: createHooks()
    };
}
