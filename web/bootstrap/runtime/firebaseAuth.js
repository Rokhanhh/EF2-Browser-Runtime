import { FIREBASE_DEFAULT_CONFIG, GOOGLE_WEB_CLIENT_ID } from "./config.js";

let googleIdentityScriptPromise = null;

export function installFirebaseDefaults() {
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
                finish(reject, new Error(`Google prompt skipped: ${notification.getSkippedReason() || "unknown"}`));
            }
        });
    });
}

export function installGoogleLoginBridge() {
    let attempts = 0;
    const maxAttempts = 250;

    const tryPatch = () => {
        const plugin =
            window.Capacitor && window.Capacitor.Plugins ? window.Capacitor.Plugins.FirebaseAuthentication : null;
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
                const currentUserResult = typeof plugin.getCurrentUser === "function" ? await plugin.getCurrentUser() : null;
                const user = currentUserResult && currentUserResult.user ? currentUserResult.user : null;
                if (user) {
                    let idToken = "";
                    if (typeof plugin.getIdToken === "function") {
                        try {
                            const tokenResult = await plugin.getIdToken({ forceRefresh: true });
                            idToken = tokenResult && typeof tokenResult.token === "string" ? tokenResult.token : "";
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

