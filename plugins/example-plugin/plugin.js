export default {
    id: "example-plugin",
    handleKey: "__EF_EXAMPLE_PLUGIN_HANDLE__",

    setup(runtime) {
        runtime.logger.info("example-plugin", "installed", {
            version: runtime.version
        });

        const installedCount = runtime.storage.get("example-plugin", "installedCount", 0) + 1;
        runtime.storage.set("example-plugin", "installedCount", installedCount);

        const unsubscribeNetwork = runtime.network.onJsonResponse(async (event) => {
            if (!event.url.toLowerCase().includes("getbatch")) {
                return;
            }

            const payload = await event.readJson();
            runtime.logger.info("example-plugin", "observed getbatch", {
                version: payload?.version || "unknown"
            });
        });

        const unsubscribeEvent = runtime.events.on("example-plugin:ping", (payload) => {
            runtime.logger.info("example-plugin", "received ping", payload);
        });

        return {
            detach() {
                unsubscribeNetwork();
                unsubscribeEvent();
                runtime.logger.info("example-plugin", "detached");
            }
        };
    }
};
