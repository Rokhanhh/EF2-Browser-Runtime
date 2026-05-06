(function loadRuntimeBootstrap() {
    const currentScript = document.currentScript;
    let query = "";
    if (currentScript && currentScript.src) {
        try {
            query = new URL(currentScript.src, window.location.href).search || "";
        } catch (error) {
            query = "";
        }
    }

    const bootstrapUrl = `./runtime/bootstrap.js${query}`;
    import(bootstrapUrl)
        .then(module => {
            if (!module || typeof module.startRuntime !== "function") {
                throw new Error("Invalid runtime bootstrap module.");
            }
            module.startRuntime();
        })
        .catch(error => {
            console.error("[ef-runtime] bootstrap module load failed:", error);
            const text = error && error.message ? error.message : String(error);
            if (typeof window.updateSplashStatus === "function") {
                window.updateSplashStatus(`Runtime failed: ${text}`);
            }
        });
})();

