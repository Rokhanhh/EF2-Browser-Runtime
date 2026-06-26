# Local Runtime Plugins

This folder contains browser-side runtime plugins. Plugins can add overlays, observe game state, hook game objects, and observe network traffic through the runtime API.

Python remains the local server, bundle manager, and proxy. Plugins run in the browser and are discovered from `plugins/*/plugin.json`.

The bundled plugins `wave-tracker` and `auto-skiller` live here. `example-plugin` is disabled by default and can be copied or enabled as a starting point.

## Install a Plugin

Copy a plugin folder here:

```text
plugins/
  my-plugin/
    plugin.json
    plugin.js
```

`plugin.json`:

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "enabled": true,
  "entry": "plugin.js",
  "handleKey": "__EF_MY_PLUGIN_HANDLE__"
}
```

The Python server discovers `plugins/*/plugin.json`, builds `/__ef_plugins__/manifest.json`, and serves plugin files under `/__ef_plugins__/<plugin-folder>/...`.

Restart the local server after adding, removing, or editing plugin folders. The server logs active local plugin ids at startup and adds `?v=<mtime>` cache busting to plugin entries automatically.

Plugins are enabled or disabled with `"enabled"` in `plugin.json`.

## Plugin Contract

`plugin.js` must export a default runtime plugin:

```js
export default {
    id: "my-plugin",
    handleKey: "__EF_MY_PLUGIN_HANDLE__",

    setup(runtime) {
        return {
            detach() {}
        };
    }
};
```

- `id`: stable plugin id used in logs and plugin maps.
- `handleKey`: optional global handle key used to avoid double installs.
- `setup(runtime)`: installs the plugin and returns a handle.
- `detach()`: removes timers, listeners, overlays, and hooks created by the plugin.

Any visible overlay root should include `data-ef-plugin-overlay="<plugin-id>"`.
The plugin panel uses this attribute to show or hide plugin overlays.

## Runtime Object

`setup(runtime)` receives:

```js
{
    version,
    manifest,
    config,
    logger,
    storage,
    events,
    network,
    hooks
}
```

### logger

```js
runtime.logger.info(pluginId, message, data);
runtime.logger.warn(pluginId, message, error);
runtime.logger.error(pluginId, message, error);
```

### storage

```js
runtime.storage.get(pluginId, key, fallback);
runtime.storage.set(pluginId, key, value);
runtime.storage.remove(pluginId, key);
```

Storage is backed by `localStorage` and namespaced as:

```text
__EF_PLUGIN__:<pluginId>:<key>
```

### events

```js
const unsubscribe = runtime.events.on("event:name", payload => {});
runtime.events.emit("event:name", payload);
unsubscribe();
```

Listener errors are logged and do not break the runtime.

### network

The network API is observe-only. Plugins can inspect traffic, but must not modify requests or responses.

```js
runtime.network.onRequest(handler);
runtime.network.onResponse(handler);
runtime.network.onJsonResponse(handler);
runtime.network.onWebSocketCreate(handler);
runtime.network.onWebSocketMessage(handler);
runtime.network.onWebSocketSend(handler);
```

Every registration returns `unsubscribe`.

Network events are frozen snapshots. The API does not expose live `Request`, `Response`, `XMLHttpRequest`, `WebSocket`, or native event objects to plugins.

Response events expose cached readers:

```js
runtime.network.onJsonResponse(async event => {
    if (!event.url.includes("getbatch")) {
        return;
    }

    const payload = await event.readJson();
    // payload is read-only/frozen
});
```

Common fields:

```js
{
    type,       // "fetch", "xhr", or "websocket"
    method,
    url,
    proxiedUrl,
    status,
    ok,
    headers,
    responseText,
    data,
    readText,
    readJson
}
```

Only fields relevant to the event type are present.

### hooks

Use hooks instead of patching globals directly:

```js
runtime.hooks.onObjectWithProperties(["remainingFrames"], candidate => {});
runtime.hooks.onWaveController(controller => {});
runtime.hooks.onJsonParse(parsed => {});
runtime.hooks.wrapMethod(object, "methodName", original => {
    return function wrappedMethod(...args) {
        return original.apply(this, args);
    };
}, "__myPluginWrapped");
```

Each hook registration returns a cleanup function when applicable.

## Example

```js
export default {
    id: "batch-logger",
    handleKey: "__EF_BATCH_LOGGER_HANDLE__",

    setup(runtime) {
        const unsubscribe = runtime.network.onJsonResponse(async event => {
            if (!event.url.toLowerCase().includes("getbatch")) {
                return;
            }
            const payload = await event.readJson();
            runtime.logger.info("batch-logger", "captured getbatch", {
                version: payload?.version || "unknown"
            });
        });

        return {
            detach() {
                unsubscribe();
            }
        };
    }
};
```

## Current Plugins

- `plugins/wave-tracker`: tracks waves, metrics, medal projections, and captures rebirth medal tier data from observed JSON responses.
- `plugins/auto-skiller`: observes game objects and automates configured skill actions.
- `plugins/example-plugin`: disabled sample plugin showing the minimum local plugin structure.

## Rules

- Do not patch `fetch`, `XMLHttpRequest`, `WebSocket`, `JSON.parse`, or `Object.defineProperty` directly.
- Use `runtime.network` for traffic observation.
- Use `runtime.hooks` for game-object detection and method wrapping.
- Always return a `detach()` method.
- Keep network usage read-only.
- Do not depend on plugin installation order unless plugins communicate through `runtime.events`.
