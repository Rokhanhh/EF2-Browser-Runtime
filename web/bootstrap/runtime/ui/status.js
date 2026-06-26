export function setLoaderState(state) {
    window.__EF_RUNTIME_STATE__ = state;
    if (document.body) {
        document.body.dataset.runtimeState = state;
    }
}

export function setStatus(text) {
    if (typeof window.updateSplashStatus === "function") {
        window.updateSplashStatus(text);
    }
}

export function showError(message) {
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
