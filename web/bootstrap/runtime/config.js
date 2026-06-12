const runtimeConfig = window.__EF_RUNTIME_CONFIG__ || {};

export const REMOTE_ORIGIN = runtimeConfig.remoteOrigin;
export const REMOTE_WS_ORIGIN = runtimeConfig.remoteWsOrigin;
export const PROXY_PREFIX = runtimeConfig.proxyPrefix;
export const WS_PROXY_PREFIX = runtimeConfig.wsProxyPrefix;
export const SHOW_WAVE_TRACKER = runtimeConfig.showWaveTracker !== false;
export const SHOW_AUTO_SKILLER = runtimeConfig.showAutoSkiller !== false;

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
