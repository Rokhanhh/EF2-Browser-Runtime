const REMOTE_ORIGIN = "https://game.endlessfrontier.io";
const REMOTE_WS_ORIGIN = window.__EF_REMOTE_WS_ORIGIN__ || "ws://game.endlessfrontier.io:5001";
const PROXY_PREFIX = "/__ef_proxy__";
const WS_PROXY_PREFIX = "/__ef_ws_proxy__";
const FIREBASE_DEFAULT_CONFIG = {
    apiKey: "AIzaSyC_ZDJUKRitUUZIwYK3LPe1qqZooG3kL6A",
    authDomain: "endless-frontier-2.firebaseapp.com",
    projectId: "endless-frontier-2",
    storageBucket: "endless-frontier-2.firebasestorage.app",
    messagingSenderId: "911317121499",
    appId: "1:911317121499:android:8815a191010cd76de1cffe",
};
const GOOGLE_WEB_CLIENT_ID =
    "911317121499-9fcd1j8k40dv4bciog53f4ofgbffughs.apps.googleusercontent.com";

let googleIdentityScriptPromise = null;

function proxiedUrl(input) {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : null;
    if (!url || !url.startsWith(REMOTE_ORIGIN + "/")) {
        return input;
    }
    const parsed = new URL(url);
    return `${PROXY_PREFIX}${parsed.pathname}${parsed.search}`;
}

function proxiedWebSocketUrl(input) {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : null;
    if (!url || (!url.startsWith(REMOTE_WS_ORIGIN + "/") && url !== REMOTE_WS_ORIGIN)) {
        return input;
    }

    const localScheme = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${localScheme}//${window.location.host}${WS_PROXY_PREFIX}?target=${encodeURIComponent(url)}`;
}

function setLoaderState(state) {
    window.__EF_RUNTIME_STATE__ = state;
    if (document.body) {
        document.body.dataset.runtimeState = state;
    }
}

function setStatus(text) {
    if (typeof window.updateSplashStatus === "function") {
        window.updateSplashStatus(text);
    }
}

function showError(message) {
    const node = document.createElement("div");
    node.style.cssText = [
        "position:fixed",
        "inset:auto 16px 16px 16px",
        "z-index:10000",
        "padding:14px 16px",
        "border-radius:12px",
        "background:#7f1d1d",
        "color:#fff",
        "font:13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif",
        "white-space:pre-line",
    ].join(";");
    node.textContent = message;
    document.body.appendChild(node);
}

function installNetworkProxy() {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init) => nativeFetch(proxiedUrl(input), init);

    const NativeWebSocket = window.__EF_NATIVE_WEBSOCKET__ || window.WebSocket;
    if (typeof NativeWebSocket === "function" && !NativeWebSocket.__efPatched) {
        const PatchedWebSocket = function patchedWebSocket(url, protocols) {
            const proxied = proxiedWebSocketUrl(url);
            if (proxied !== url) {
                console.info("[ef-runtime] WebSocket proxied.", { from: url, to: proxied });
            }
            if (protocols === undefined) {
                return new NativeWebSocket(proxied);
            }
            return new NativeWebSocket(proxied, protocols);
        };
        PatchedWebSocket.prototype = NativeWebSocket.prototype;
        PatchedWebSocket.CONNECTING = NativeWebSocket.CONNECTING;
        PatchedWebSocket.OPEN = NativeWebSocket.OPEN;
        PatchedWebSocket.CLOSING = NativeWebSocket.CLOSING;
        PatchedWebSocket.CLOSED = NativeWebSocket.CLOSED;
        PatchedWebSocket.__efPatched = true;
        Object.setPrototypeOf(PatchedWebSocket, NativeWebSocket);
        window.WebSocket = PatchedWebSocket;
        globalThis.WebSocket = PatchedWebSocket;
        if (typeof self === "object") {
            self.WebSocket = PatchedWebSocket;
        }
    }

    const NativeXHR = window.XMLHttpRequest;
    if (typeof NativeXHR !== "function") {
        return;
    }

    const nativeOpen = NativeXHR.prototype.open;
    NativeXHR.prototype.open = function patchedOpen(method, url, ...rest) {
        return nativeOpen.call(this, method, proxiedUrl(url), ...rest);
    };
}

function installFirebaseDefaults() {
    const overrideConfig =
        window.__EF_FIREBASE_CONFIG__ && typeof window.__EF_FIREBASE_CONFIG__ === "object"
            ? window.__EF_FIREBASE_CONFIG__
            : {};
    const config = {
        ...FIREBASE_DEFAULT_CONFIG,
        ...overrideConfig,
    };
    const defaults =
        window.__FIREBASE_DEFAULTS__ && typeof window.__FIREBASE_DEFAULTS__ === "object"
            ? window.__FIREBASE_DEFAULTS__
            : {};

    window.__FIREBASE_DEFAULTS__ = {
        ...defaults,
        config: {
            ...(defaults.config || {}),
            ...config,
        },
    };
    window.efFirebaseDebug = {
        config,
        defaults: window.__FIREBASE_DEFAULTS__,
        googleWebClientId: window.__EF_GOOGLE_WEB_CLIENT_ID__ || GOOGLE_WEB_CLIENT_ID,
    };
}

function loadGoogleIdentityScript() {
    if (window.google && window.google.accounts && window.google.accounts.id) {
        return Promise.resolve();
    }
    if (googleIdentityScriptPromise) {
        return googleIdentityScriptPromise;
    }

    googleIdentityScriptPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.defer = true;
        script.onload = resolve;
        script.onerror = () => reject(new Error("Google Identity script failed to load."));
        document.head.appendChild(script);
    });
    return googleIdentityScriptPromise;
}

function decodeJwtPayload(jwt) {
    if (typeof jwt !== "string") {
        return null;
    }
    const parts = jwt.split(".");
    if (parts.length < 2) {
        return null;
    }
    try {
        const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
        return JSON.parse(atob(padded));
    } catch (error) {
        return null;
    }
}

async function signInWithGoogleIdentityServices() {
    await loadGoogleIdentityScript();

    const clientId = window.__EF_GOOGLE_WEB_CLIENT_ID__ || GOOGLE_WEB_CLIENT_ID;
    if (!clientId) {
        throw new Error("Missing Google web client id.");
    }

    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (fn, value) => {
            if (settled) return;
            settled = true;
            fn(value);
        };

        window.google.accounts.id.initialize({
            client_id: clientId,
            auto_select: false,
            cancel_on_tap_outside: true,
            context: "signin",
            use_fedcm_for_prompt: false,
            callback: response => {
                if (!response || !response.credential) {
                    finish(reject, new Error("Google Identity returned no credential."));
                    return;
                }

                const payload = decodeJwtPayload(response.credential) || {};
                finish(resolve, {
                    user: {
                        uid: payload.sub || "",
                        displayName: payload.name || null,
                        email: payload.email || null,
                        emailVerified: Boolean(payload.email_verified),
                        photoUrl: payload.picture || null,
                    },
                    credential: {
                        providerId: "google.com",
                        idToken: response.credential,
                    },
                    additionalUserInfo: null,
                });
            },
        });

        window.google.accounts.id.prompt(notification => {
            if (settled) {
                return;
            }
            if (notification.isNotDisplayed && notification.isNotDisplayed()) {
                finish(
                    reject,
                    new Error(`Google prompt not displayed: ${notification.getNotDisplayedReason() || "unknown"}`)
                );
                return;
            }
            if (notification.isSkippedMoment && notification.isSkippedMoment()) {
                finish(
                    reject,
                    new Error(`Google prompt skipped: ${notification.getSkippedReason() || "unknown"}`)
                );
            }
        });
    });
}

function installGoogleLoginBridge() {
    let attempts = 0;
    const maxAttempts = 250;

    const tryPatch = () => {
        const plugin = window.Capacitor && window.Capacitor.Plugins
            ? window.Capacitor.Plugins.FirebaseAuthentication
            : null;
        if (!plugin || plugin.__efGoogleBridgeInstalled || typeof plugin.signInWithGoogle !== "function") {
            return false;
        }

        const nativeSignInWithGoogle = plugin.signInWithGoogle.bind(plugin);
        plugin.signInWithGoogle = async function patchedSignInWithGoogle(options) {
            try {
                const gisResult = await signInWithGoogleIdentityServices();
                console.info("[ef-runtime] Google Identity Services login succeeded.", {
                    uid: gisResult && gisResult.user ? gisResult.user.uid : null,
                });
                return gisResult;
            } catch (gisError) {
                console.warn("[ef-runtime] GIS login failed; falling back to Firebase popup.", gisError);
            }

            let result = null;
            let originalError = null;
            try {
                result = await nativeSignInWithGoogle(options);
                if (result && result.user) {
                    return result;
                }
            } catch (error) {
                originalError = error;
                console.warn("[ef-runtime] Firebase popup login failed; trying currentUser fallback.", error);
            }

            try {
                const currentUserResult = typeof plugin.getCurrentUser === "function"
                    ? await plugin.getCurrentUser()
                    : null;
                const user = currentUserResult && currentUserResult.user ? currentUserResult.user : null;
                if (user) {
                    let idToken = "";
                    if (typeof plugin.getIdToken === "function") {
                        try {
                            const tokenResult = await plugin.getIdToken({ forceRefresh: true });
                            idToken = tokenResult && typeof tokenResult.token === "string"
                                ? tokenResult.token
                                : "";
                        } catch (tokenError) {
                            console.warn("[ef-runtime] Could not refresh Firebase idToken.", tokenError);
                        }
                    }
                    return {
                        user,
                        credential: {
                            providerId: "google.com",
                            idToken,
                        },
                        additionalUserInfo: result && result.additionalUserInfo ? result.additionalUserInfo : null,
                    };
                }
            } catch (recoveryError) {
                console.warn("[ef-runtime] currentUser fallback failed.", recoveryError);
            }

            throw originalError || new Error("Google sign-in did not return a user.");
        };

        plugin.__efGoogleBridgeInstalled = true;
        return true;
    };

    if (tryPatch()) {
        return;
    }

    const intervalId = window.setInterval(() => {
        attempts += 1;
        if (tryPatch() || attempts >= maxAttempts) {
            window.clearInterval(intervalId);
        }
    }, 100);
}

function ensureBrowserGlobals(version) {
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
}

async function loadManifest() {
    const response = await fetch("./game-manifest.json", { cache: "no-store" });
    if (!response.ok) {
        throw new Error(`Could not load game-manifest.json (${response.status})`);
    }
    return response.json();
}

function loadCssFile(cssPath) {
    return new Promise((resolve, reject) => {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = `./${cssPath}`;
        link.onload = resolve;
        link.onerror = () => reject(new Error(`Could not load ${cssPath}`));
        document.head.appendChild(link);
    });
}

function loadModule(modulePath) {
    return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.type = "module";
        script.src = `./${modulePath}`;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Could not load ${modulePath}`));
        document.head.appendChild(script);
    });
}

async function callGameStart(maxAttempts = 150) {
    let attempts = 0;
    while (attempts < maxAttempts) {
        if (typeof window.startElfDefenderGame === "function") {
            const startResult = window.startElfDefenderGame();
            if (startResult && typeof startResult.then === "function") {
                await Promise.race([
                    startResult,
                    new Promise(resolve => window.setTimeout(resolve, 2000)),
                ]);
            }
            return;
        }
        await new Promise(resolve => window.setTimeout(resolve, 100));
        attempts += 1;
    }
    throw new Error("The bundle loaded but window.startElfDefenderGame was not exposed.");
}

document.addEventListener("DOMContentLoaded", async () => {
    try {
        setLoaderState("loading-manifest");
        setStatus("Preparing runtime...");

        const manifest = await loadManifest();
        ensureBrowserGlobals(manifest.version || "0.0.0");

        if (Array.isArray(manifest.css)) {
            setLoaderState("loading-css");
            setStatus(`Loading bundle ${manifest.version || ""}...`);
            for (const cssPath of manifest.css) {
                await loadCssFile(cssPath);
            }
        }

        setLoaderState("loading-module");
        setStatus("Loading game module...");
        await loadModule(manifest.entry);

        setLoaderState("starting-game");
        setStatus("Starting game...");
        await callGameStart();

        setLoaderState("started");
        if (typeof window.hideSplashScreen === "function") {
            window.hideSplashScreen();
        }
    } catch (error) {
        console.error("[ef-runtime] bootstrap failed:", error);
        setLoaderState("failed");
        setStatus("Runtime failed");
        showError(
            [
                "Could not start the browser runtime.",
                "",
                error && error.message ? error.message : String(error),
                "",
                "Check the local server console.",
            ].join("\n")
        );
    }
});
