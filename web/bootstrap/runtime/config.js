const runtimeConfig = window.__EF_RUNTIME_CONFIG__ || {};

export const REMOTE_ORIGIN = runtimeConfig.remoteOrigin;
export const REMOTE_WS_ORIGIN = runtimeConfig.remoteWsOrigin;
export const PROXY_PREFIX = runtimeConfig.proxyPrefix;
export const WS_PROXY_PREFIX = runtimeConfig.wsProxyPrefix;
export const RUNTIME_TOKEN = typeof runtimeConfig.runtimeToken === "string" ? runtimeConfig.runtimeToken : "";
export const RUNTIME_TOKEN_HEADER = "X-EF-Runtime-Token";
export const RUNTIME_WS_TOKEN_PROTOCOL_PREFIX = "ef-runtime-token.";

export const FIREBASE_DEFAULT_CONFIG = {
    apiKey: "AIzaSyC_ZDJUKRitUUZIwYK3LPe1qqZooG3kL6A",
    authDomain: "endless-frontier-2.firebaseapp.com",
    projectId: "endless-frontier-2",
    storageBucket: "endless-frontier-2.firebasestorage.app",
    messagingSenderId: "911317121499",
    appId: "1:911317121499:android:8815a191010cd76de1cffe",
};

export const GOOGLE_WEB_CLIENT_ID =
    "911317121499-9fcd1j8k40dv4bciog53f4ofgbffughs.apps.googleusercontent.com";
