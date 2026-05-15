(function installSmoothSplashStatus() {
    const minStatusVisibleMs = 700;
    let lastCommitAt = 0;
    let pendingText = null;
    let timerId = null;

    function commit(text) {
        const node = document.getElementById("status-text");
        if (node) node.textContent = text;
        lastCommitAt = Date.now();
    }

    function flushPending() {
        timerId = null;
        if (pendingText === null) return;
        const text = pendingText;
        pendingText = null;
        commit(text);
    }

    window.updateSplashStatus = function (text) {
        const next = String(text || "");
        const now = Date.now();
        const elapsed = now - lastCommitAt;

        if (lastCommitAt === 0 || elapsed >= minStatusVisibleMs) {
            if (timerId) {
                clearTimeout(timerId);
                timerId = null;
            }
            pendingText = null;
            commit(next);
            return;
        }

        pendingText = next;
        if (!timerId) {
            timerId = setTimeout(flushPending, minStatusVisibleMs - elapsed);
        }
    };
})();

window.updateSplashVersion = function (version) {
    const node = document.getElementById("version-text");
    if (!node) return;
    node.textContent = `Version: ${version || "unknown"}`;
};

window.updateServerStatus = function (active) {
    const node = document.getElementById("server-status-text");
    if (!node) return;
    node.innerHTML = active
        ? 'Server Status: <span class="status-active">Active</span>'
        : 'Server Status: <span class="status-inactive">Inactive</span>';
};

window.hideSplashScreen = function () {
    const splash = document.getElementById("splash");
    if (!splash) return;
    splash.classList.add("fade-out");
    setTimeout(() => splash.remove(), 280);
};

window.waitForStartGame = function () {
    return new Promise(resolve => {
        const button = document.getElementById("start-game-btn");
        if (!button) {
            resolve();
            return;
        }

        const onClick = () => {
            const splash = document.getElementById("splash");
            if (splash) splash.classList.add("loading");
            button.disabled = true;
            button.textContent = "Starting...";
            resolve();
        };

        button.addEventListener("click", onClick, { once: true });
    });
};

window.clearRuntimeCacheAndReload = async function () {
    const button = document.getElementById("clear-cache-btn");
    const startButton = document.getElementById("start-game-btn");
    const setStatus = window.updateSplashStatus || function () {};
    if (button) button.disabled = true;
    if (startButton) startButton.disabled = true;
    setStatus("Clearing browser data...");

    try {
        if ("caches" in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map(key => caches.delete(key)));
        }

        if ("serviceWorker" in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map(reg => reg.unregister()));
        }

        try {
            window.localStorage.clear();
            window.sessionStorage.clear();
        } catch (error) {
            console.warn("[ef-runtime] storage clear warning:", error);
        }

        if (window.indexedDB && typeof window.indexedDB.databases === "function") {
            const dbs = await window.indexedDB.databases();
            await Promise.all(
                dbs
                    .map(db => db && db.name)
                    .filter(Boolean)
                    .map(
                        name =>
                            new Promise(resolve => {
                                const req = window.indexedDB.deleteDatabase(name);
                                req.onsuccess = () => resolve();
                                req.onerror = () => resolve();
                                req.onblocked = () => resolve();
                            })
                    )
            );
        }

        const cookies = document.cookie ? document.cookie.split(";") : [];
        for (const rawCookie of cookies) {
            const eqPos = rawCookie.indexOf("=");
            const name = (eqPos > -1 ? rawCookie.slice(0, eqPos) : rawCookie).trim();
            if (!name) continue;
            document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
        }

        setStatus("Browser data cleared. Reloading...");
        window.location.reload();
    } catch (error) {
        console.error("[ef-runtime] clear browser data failed:", error);
        setStatus("Data clear failed");
        if (button) button.disabled = false;
        if (startButton) startButton.disabled = false;
    }
};

(function bindClearCacheButton() {
    const button = document.getElementById("clear-cache-btn");
    if (!button) return;
    button.addEventListener("click", () => {
        window.clearRuntimeCacheAndReload();
    });
})();

(function monitorServerStatus() {
    const intervalMs = 1000;
    let timerId = null;

    async function checkOnce() {
        try {
            const probeUrl = `./game-manifest.json?status_probe=${Date.now()}`;
            const response = await fetch(probeUrl, { cache: "no-store" });
            window.updateServerStatus(Boolean(response && response.ok));
        } catch (error) {
            window.updateServerStatus(false);
        }
    }

    checkOnce();
    timerId = setInterval(checkOnce, intervalMs);

    const splash = document.getElementById("splash");
    if (splash) {
        const observer = new MutationObserver(() => {
            if (!document.getElementById("splash")) {
                if (timerId) clearInterval(timerId);
                observer.disconnect();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }
})();
