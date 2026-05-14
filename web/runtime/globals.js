import { installCapacitorPluginShims } from "./capacitorPlugins.js";
import { installFirebaseDefaults, installGoogleLoginBridge } from "./firebaseAuth.js";
import { installNetworkProxy } from "./networkProxy.js";

function installFpsOverlay() {
    if (window.__efFpsOverlayInstalled) {
        return;
    }
    window.__efFpsOverlayInstalled = true;

    const overlay = document.createElement("div");
    overlay.id = "ef-fps-overlay";
    overlay.textContent = "FPS: --";
    overlay.style.position = "fixed";
    overlay.style.top = "8px";
    overlay.style.left = "8px";
    overlay.style.zIndex = "2147483647";
    overlay.style.padding = "4px 8px";
    overlay.style.borderRadius = "6px";
    overlay.style.background = "rgba(0, 0, 0, 0.65)";
    overlay.style.color = "#99ffb3";
    overlay.style.fontFamily = "monospace";
    overlay.style.fontSize = "12px";
    overlay.style.lineHeight = "1.2";
    overlay.style.pointerEvents = "none";
    document.documentElement.appendChild(overlay);

    let frameCount = 0;
    let lastTimestamp = performance.now();
    const update = now => {
        frameCount += 1;
        const elapsed = now - lastTimestamp;
        if (elapsed >= 500) {
            const fps = Math.round((frameCount * 1000) / elapsed);
            overlay.textContent = `FPS: ${fps}`;
            frameCount = 0;
            lastTimestamp = now;
        }
        window.requestAnimationFrame(update);
    };

    window.requestAnimationFrame(update);
}

export function ensureBrowserGlobals(version) {
    if (typeof window.__EF_FORCE_GB__ === "undefined") {
        window.__EF_FORCE_GB__ = true;
    }
    if (typeof window.krMode === "undefined") {
        window.krMode = "n";
    }
    if (typeof window.targetMode === "undefined") {
        window.targetMode = "production";
    }
    if (!window.CapacitorCustomPlatform || typeof window.CapacitorCustomPlatform !== "object") {
        window.CapacitorCustomPlatform = { name: "android" };
    }

    window.targetMode = "production";
    window.krMode = "n";
    window.appBundleVersion = version;
    window.appBundleLocalMainVersion = version;
    window.appBundleLocalSubVersion = version;
    window.gameBaseUrl = new URL(".", window.location.href).href.replace(/\/$/, "");

    window.Capacitor = window.Capacitor || {
        getPlatform: () => "web",
        convertFileSrc: value => value,
        isNativePlatform: () => false,
        Plugins: {},
    };
    window.cordova = window.cordova || {};
    installFpsOverlay();

    installNetworkProxy();
    installFirebaseDefaults();
    installGoogleLoginBridge();
    installCapacitorPluginShims();
}

