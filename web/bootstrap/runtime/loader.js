export async function loadManifest() {
    let response;
    try {
        response = await fetch("./game-manifest.json", { cache: "no-store" });
    } catch (error) {
        if (typeof window.updateServerStatus === "function") {
            window.updateServerStatus(false);
        }
        throw error;
    }

    if (typeof window.updateServerStatus === "function") {
        window.updateServerStatus(response.ok);
    }

    if (!response.ok) {
        throw new Error(`Could not load game-manifest.json (${response.status})`);
    }
    return response.json();
}

export function loadCssFile(cssPath, cacheToken) {
    return new Promise((resolve, reject) => {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = `./${cssPath}?v=${encodeURIComponent(cacheToken || Date.now().toString())}`;
        link.onload = resolve;
        link.onerror = () => reject(new Error(`Could not load ${cssPath}`));
        document.head.appendChild(link);
    });
}

export function loadModule(modulePath) {
    // Game chunks import ../index.js. Keep the entry URL identical so they share
    // one module instance and its initialized TextureManager.
    return loadModuleScriptUrl(`./${modulePath}`, modulePath);
}

function loadModuleScriptUrl(scriptUrl, modulePath) {
    return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.type = "module";
        script.src = scriptUrl;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Could not load ${modulePath}`));
        document.head.appendChild(script);
    });
}

export async function callGameStart(maxAttempts = 150) {
    let attempts = 0;
    while (attempts < maxAttempts) {
        if (typeof window.startElfDefenderGame === "function") {
            const startResult = window.startElfDefenderGame();
            if (startResult && typeof startResult.then === "function") {
                await Promise.race([startResult, new Promise(resolve => window.setTimeout(resolve, 2000))]);
            }
            return;
        }
        await new Promise(resolve => window.setTimeout(resolve, 100));
        attempts += 1;
    }
    throw new Error("The bundle loaded but window.startElfDefenderGame was not exposed.");
}

