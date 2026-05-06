import { ensureBrowserGlobals } from "./globals.js";
import { callGameStart, loadCssFile, loadManifest, loadModule } from "./loader.js";
import { setLoaderState, setStatus, showError } from "./ui.js";

async function bootstrapRuntime() {
    setLoaderState("loading-manifest");
    setStatus("Preparing runtime...");

    const manifest = await loadManifest();
    ensureBrowserGlobals(manifest.version || "0.0.0");

    if (Array.isArray(manifest.css)) {
        setLoaderState("loading-css");
        setStatus(`Loading bundle ${manifest.version || ""}...`);
        for (const cssPath of manifest.css) {
            await loadCssFile(cssPath, manifest.version);
        }
    }

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

