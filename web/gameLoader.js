/* Compatibility shim: some browser caches/request paths still ask for gameLoader.js. */
(function loadWebLoaderCompat() {
    if (window.__EF_GAME_LOADER_COMPAT_LOADED__) {
        return;
    }
    window.__EF_GAME_LOADER_COMPAT_LOADED__ = true;

    const alreadyLoaded = Array.from(document.scripts).some(script => {
        const src = script.getAttribute("src") || "";
        return src.includes("webLoader.js");
    });
    if (alreadyLoaded) {
        return;
    }

    const script = document.createElement("script");
    script.src = "./webLoader.js";
    document.head.appendChild(script);
})();
