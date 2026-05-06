import { installCapacitorPluginShims } from "./capacitorPlugins.js";
import { installFirebaseDefaults, installGoogleLoginBridge } from "./firebaseAuth.js";
import { installNetworkProxy } from "./networkProxy.js";

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

    installNetworkProxy();
    installFirebaseDefaults();
    installGoogleLoginBridge();
    installCapacitorPluginShims();
}

