import { ensureBrowserGlobals } from "./globals.js";
import { callGameStart, loadCssFile, loadManifest, loadModule } from "./loader.js";
import { createPluginRuntime, installRuntimePlugins } from "./plugin-api/index.js";
import { installRuntimeMenu, setLoaderState, setStatus, showError } from "./ui.js";

async function waitForSplashFirstPaint() {
    // Let the splash render before loading the heavy game module.
    await new Promise(resolve => window.requestAnimationFrame(() => resolve()));
    await new Promise(resolve => window.requestAnimationFrame(() => resolve()));
}

async function waitForStartButton() {
    if (typeof window.waitForStartGame === "function") {
        await window.waitForStartGame();
    }
}

async function bootstrapRuntime() {
    setLoaderState("loading-manifest");
    setStatus("Preparing runtime...");

    const manifest = await loadManifest();
    if (typeof window.updateSplashVersion === "function") {
        window.updateSplashVersion(manifest.version || "unknown");
    }
    ensureBrowserGlobals(manifest.version || "0.0.0");

    setLoaderState("awaiting-start");
    setStatus("Press Start Game");

    await waitForSplashFirstPaint();
    await waitForStartButton();

    if (Array.isArray(manifest.css)) {
        setLoaderState("loading-css");
        setStatus(`Loading bundle ${manifest.version || ""}...`);
        for (const cssPath of manifest.css) {
            await loadCssFile(cssPath, manifest.version);
        }
    }

    const runtime = createPluginRuntime({
        manifest,
        version: manifest.version || "0.0.0",
        config: window.__EF_RUNTIME_CONFIG__ || {}
    });
    window.__EF_PLUGIN_RUNTIME__ = runtime;
    const pluginHandles = await installRuntimePlugins(runtime);
    installRuntimeMenu(pluginHandles.__plugins || []);

    setLoaderState("loading-module");
    setStatus("Loading game module...");
    await loadModule(manifest.entry, manifest.version);

    setLoaderState("starting-game");
    setStatus("Starting game...");
    await callGameStart();

    setLoaderState("started");
    if (typeof window.hideSplashScreen === "function") {
        window.hideSplashScreen();
    }
}

export function startRuntime() {
    const run = async () => {
        try {
            await bootstrapRuntime();
        } catch (error) {
            console.error("[ef-runtime] bootstrap failed:", error);
            setLoaderState("failed");
            setStatus("Runtime failed");
            showError(
                ["Could not start the browser runtime.", "", error && error.message ? error.message : String(error), "", "Check the local server console."].join("\n")
            );
        }
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", run, { once: true });
        return;
    }
    run();
}
