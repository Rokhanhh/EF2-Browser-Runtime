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

export function loadModule(modulePath, cacheToken) {
    if (!window.__EF_GAME_INIT_OPTIONS__) {
        return loadModuleScriptTag(modulePath, cacheToken);
    }

    return loadPatchedModule(modulePath, cacheToken);
}

async function loadPatchedModule(modulePath, cacheToken) {
    const moduleUrl = `./${modulePath}?v=${encodeURIComponent(cacheToken || Date.now().toString())}`;
    const response = await fetch(moduleUrl, { cache: "no-store" });
    if (!response.ok) {
        throw new Error(`Could not load ${modulePath} (${response.status})`);
    }

    const patchedSource = patchGameInitOptions(await response.text());
    const blobUrl = URL.createObjectURL(new Blob([patchedSource], { type: "text/javascript" }));
    try {
        await loadModuleScriptUrl(blobUrl, modulePath);
    } finally {
        URL.revokeObjectURL(blobUrl);
    }
}

function patchGameInitOptions(source) {
    const patched = source.replace(
        /await ([A-Za-z_$][\w$]*)\.init\(\),await WL\.getInstance\(\)\.initialize\(\)/,
        "await $1.init(window.__EF_GAME_INIT_OPTIONS__||{}),await WL.getInstance().initialize()"
    );
    if (patched === source) {
        console.warn("[ef-runtime] could not patch game init options.");
    }
    return patched;
}

function loadModuleScriptTag(modulePath, cacheToken) {
    return loadModuleScriptUrl(`./${modulePath}?v=${encodeURIComponent(cacheToken || Date.now().toString())}`, modulePath);
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

