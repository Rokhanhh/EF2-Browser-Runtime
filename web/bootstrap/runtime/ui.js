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

const RUNTIME_MENU_ID = "ef-runtime-menu";
const PLUGIN_VISIBLE_STORAGE_PREFIX = "__EF_RUNTIME_PLUGIN_VISIBLE__";
const RUNTIME_MENU_COLLAPSED_STORAGE_KEY = "__EF_RUNTIME_CONFIG_COLLAPSED__";

function pluginStorageKey(pluginId) {
    return `${PLUGIN_VISIBLE_STORAGE_PREFIX}:${pluginId}`;
}

function readPluginVisiblePreference(pluginId) {
    try {
        const value = window.localStorage.getItem(pluginStorageKey(pluginId));
        return value === null ? true : value !== "false";
    } catch (error) {
        return true;
    }
}

function writePluginVisiblePreference(pluginId, visible) {
    try {
        window.localStorage.setItem(pluginStorageKey(pluginId), visible ? "true" : "false");
    } catch (error) {
        // Ignore storage errors.
    }
}

function readBooleanPreference(key, fallback = false) {
    try {
        const value = window.localStorage.getItem(key);
        return value === null ? fallback : value === "true";
    } catch (error) {
        return fallback;
    }
}

function writeBooleanPreference(key, value) {
    try {
        window.localStorage.setItem(key, value ? "true" : "false");
    } catch (error) {
        // Ignore storage errors.
    }
}

function pluginOverlayId(pluginId) {
    if (pluginId === "wave-tracker") {
        return "ef-wave-overlay";
    }
    return `ef-${pluginId}-overlay`;
}

function setPluginOverlayVisible(pluginId, visible) {
    const overlay = document.getElementById(pluginOverlayId(pluginId));
    if (overlay) {
        overlay.style.display = visible ? "" : "none";
    }
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function installDraggableWindow(node, handle, storageKey) {
    if (!node || !handle) {
        return;
    }

    function readPosition() {
        try {
            const position = JSON.parse(window.localStorage.getItem(storageKey) || "null");
            if (Number.isFinite(position?.left) && Number.isFinite(position?.top)) {
                return position;
            }
        } catch (error) {
            // Ignore storage errors.
        }
        return null;
    }

    function writePosition(left, top) {
        try {
            window.localStorage.setItem(storageKey, JSON.stringify({ left, top }));
        } catch (error) {
            // Ignore storage errors.
        }
    }

    function clampPosition(left, top) {
        const rect = node.getBoundingClientRect();
        const maxLeft = Math.max(0, window.innerWidth - rect.width);
        const maxTop = Math.max(0, window.innerHeight - rect.height);
        return {
            left: Math.min(Math.max(0, left), maxLeft),
            top: Math.min(Math.max(0, top), maxTop)
        };
    }

    function setPosition(left, top, persist = false) {
        const next = clampPosition(left, top);
        node.style.left = `${next.left}px`;
        node.style.top = `${next.top}px`;
        node.style.right = "auto";
        node.style.bottom = "auto";
        if (persist) {
            writePosition(next.left, next.top);
        }
    }

    const storedPosition = readPosition();
    if (storedPosition) {
        requestAnimationFrame(() => setPosition(storedPosition.left, storedPosition.top));
    }

    handle.style.cursor = "move";
    handle.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || event.target?.closest?.("button, input, select, textarea, label, a")) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        const rect = node.getBoundingClientRect();
        const offsetX = event.clientX - rect.left;
        const offsetY = event.clientY - rect.top;
        handle.setPointerCapture?.(event.pointerId);

        const onPointerMove = (moveEvent) => {
            moveEvent.preventDefault();
            setPosition(moveEvent.clientX - offsetX, moveEvent.clientY - offsetY);
        };
        const onPointerUp = (upEvent) => {
            handle.releasePointerCapture?.(event.pointerId);
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", onPointerUp);
            const nextRect = node.getBoundingClientRect();
            setPosition(nextRect.left, nextRect.top, true);
            upEvent.stopPropagation();
        };

        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp, { once: true });
    });
}

function ensureRuntimeMenuStyle() {
    if (document.getElementById(`${RUNTIME_MENU_ID}-style`)) {
        return;
    }

    const style = document.createElement("style");
    style.id = `${RUNTIME_MENU_ID}-style`;
    style.textContent = `
#${RUNTIME_MENU_ID} {
  position: fixed;
  left: 8px;
  top: 8px;
  z-index: 2147483647;
  box-sizing: border-box;
  width: 230px;
  min-width: 230px;
  max-width: calc(100vw - 16px);
  min-height: 120px;
  padding: 9px 11px;
  border: 1px solid rgba(255, 224, 138, 0.35);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.72);
  font-family: monospace;
  font-size: 12px;
  line-height: 1.25;
  color: #ffe08a;
  pointer-events: auto;
}
#${RUNTIME_MENU_ID}.ef-runtime-menu-collapsed {
  min-width: 140px;
  width: 140px;
  min-height: 0;
  height: 38px;
  overflow: hidden;
  padding: 9px 11px;
}
#${RUNTIME_MENU_ID}.ef-runtime-menu-collapsed > :not(.ef-runtime-menu-header) {
  display: none !important;
}
#${RUNTIME_MENU_ID}.ef-runtime-menu-collapsed .ef-runtime-menu-header {
  min-height: 18px;
}
#${RUNTIME_MENU_ID}.ef-runtime-menu-collapsed .ef-runtime-menu-collapse {
  top: -2px;
  left: -4px;
}
#${RUNTIME_MENU_ID} .ef-runtime-menu-header {
  position: relative;
  min-height: 20px;
}
#${RUNTIME_MENU_ID} .ef-runtime-menu-title {
  font-size: 14px;
  font-weight: 700;
  margin: 0 0 0 24px;
  text-align: center;
}
#${RUNTIME_MENU_ID} .ef-runtime-tab-panels {
  border: 1px solid rgba(255, 224, 138, 0.35);
  border-top: 0;
  border-radius: 0 0 6px 6px;
  min-height: 44px;
  padding: 10px 9px 9px;
  background: rgba(0, 0, 0, 0.18);
}
#${RUNTIME_MENU_ID} .ef-runtime-menu-collapse {
  position: absolute;
  top: -2px;
  left: -4px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  box-sizing: border-box;
  border: 1px solid rgba(255, 224, 138, 0.45);
  border-radius: 3px;
  background: rgba(255, 224, 138, 0.12);
  color: #ffe08a;
  font: inherit;
  font-weight: 700;
  line-height: 1;
  padding: 0;
  cursor: pointer;
  text-align: center;
}
#${RUNTIME_MENU_ID} .ef-runtime-menu-collapse:hover {
  background: rgba(255, 224, 138, 0.22);
}
#${RUNTIME_MENU_ID} .ef-runtime-menu-tabs {
  display: flex;
  align-items: end;
  gap: 0;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 224, 138, 0.20);
  padding-left: 0;
}
#${RUNTIME_MENU_ID} .ef-runtime-menu-tabs::after {
  content: "";
  flex: 1;
  height: 1px;
  border-bottom: 1px solid rgba(255, 224, 138, 0.35);
  transform: translateY(1px);
}
#${RUNTIME_MENU_ID} .ef-runtime-menu-tab {
  height: 26px;
  min-width: 84px;
  padding: 0 12px;
  border: 1px solid rgba(255, 224, 138, 0.35);
  border-bottom-color: rgba(255, 224, 138, 0.35);
  border-radius: 6px 6px 0 0;
  background: rgba(0, 0, 0, 0.46);
  color: #ffe08a;
  font: inherit;
  cursor: pointer;
  transform: translateY(1px);
}
#${RUNTIME_MENU_ID} .ef-runtime-menu-tab + .ef-runtime-menu-tab {
  margin-left: -1px;
}
#${RUNTIME_MENU_ID} .ef-runtime-menu-tab[aria-selected="true"] {
  position: relative;
  z-index: 1;
  height: 27px;
  background: rgba(0, 0, 0, 0.72);
  border-color: rgba(255, 224, 138, 0.70);
  border-bottom-color: rgba(0, 0, 0, 0.72);
  font-weight: 700;
  transform: translateY(1px);
}
#${RUNTIME_MENU_ID} .ef-runtime-menu-tab[aria-selected="false"]:hover {
  background: rgba(255, 224, 138, 0.12);
  border-color: rgba(255, 224, 138, 0.50);
}
#${RUNTIME_MENU_ID} .ef-runtime-panel {
  display: none;
}
#${RUNTIME_MENU_ID} .ef-runtime-panel[aria-hidden="false"] {
  display: block;
}
#${RUNTIME_MENU_ID} .ef-runtime-general-row {
  min-height: 28px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 72px;
  gap: 8px;
  align-items: center;
  color: rgba(255, 224, 138, 0.86);
}
#${RUNTIME_MENU_ID} .ef-runtime-general-value {
  width: 72px;
  height: 26px;
  box-sizing: border-box;
  border: 1px solid rgba(255, 224, 138, 0.35);
  border-radius: 5px;
  background: rgba(0, 0, 0, 0.28);
  color: rgba(255, 224, 138, 0.78);
  font: inherit;
  text-align: center;
  user-select: none;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
#${RUNTIME_MENU_ID} .ef-runtime-plugin-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 6px;
}
#${RUNTIME_MENU_ID} .ef-runtime-plugin-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 34px;
  gap: 6px;
  align-items: center;
  min-height: 28px;
}
#${RUNTIME_MENU_ID} .ef-runtime-plugin-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
#${RUNTIME_MENU_ID} .ef-runtime-plugin-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
}
#${RUNTIME_MENU_ID} .ef-runtime-plugin-toggle input {
  width: 16px;
  height: 16px;
  margin: 0;
}
`;
    document.head.appendChild(style);
}

export function installRuntimeMenu(plugins = []) {
    if (!document.body || document.getElementById(RUNTIME_MENU_ID)) {
        return;
    }

    ensureRuntimeMenuStyle();

    const pluginItems = plugins
        .filter((plugin) => plugin && plugin.id)
        .map((plugin) => ({
            id: String(plugin.id),
            name: String(plugin.name || plugin.id)
        }));
    const pluginVisibility = new Map(pluginItems.map((plugin) => [plugin.id, readPluginVisiblePreference(plugin.id)]));
    const node = document.createElement("div");
    node.id = RUNTIME_MENU_ID;
    const currentPort = window.location.port || (window.location.protocol === "https:" ? "443" : "80");
    node.innerHTML = `
<div class="ef-runtime-menu-header">
  <div class="ef-runtime-menu-title">Config</div>
  <button class="ef-runtime-menu-collapse" data-action="toggleCollapse" type="button" aria-label="Minimize Config Menu">-</button>
</div>
<div class="ef-runtime-menu-tabs" role="tablist" aria-label="Config menu">
  <button class="ef-runtime-menu-tab" data-tab="general" role="tab" aria-selected="true" type="button">General</button>
  <button class="ef-runtime-menu-tab" data-tab="plugins" role="tab" aria-selected="false" type="button">Plugins</button>
</div>
<div class="ef-runtime-tab-panels">
  <div class="ef-runtime-panel" data-panel="general" role="tabpanel" aria-hidden="false">
    <label class="ef-runtime-general-row">
      <span>Port</span>
      <span class="ef-runtime-general-value" aria-disabled="true">${escapeHtml(currentPort)}</span>
    </label>
  </div>
  <div class="ef-runtime-panel" data-panel="plugins" role="tabpanel" aria-hidden="true">
    <div class="ef-runtime-plugin-list">
      ${pluginItems.length > 0
            ? pluginItems.map((plugin) => `<label class="ef-runtime-plugin-row">
        <span class="ef-runtime-plugin-name">${escapeHtml(plugin.name)}</span>
        <span class="ef-runtime-plugin-toggle"><input data-plugin-id="${escapeHtml(plugin.id)}" type="checkbox"></span>
      </label>`).join("")
            : `<div class="ef-runtime-plugin-row"><span class="ef-runtime-plugin-name">No plugins</span></div>`}
    </div>
  </div>
</div>
`;

    const collapseButton = node.querySelector('[data-action="toggleCollapse"]');
    const header = node.querySelector(".ef-runtime-menu-header");
    const tabButtons = Array.from(node.querySelectorAll("[data-tab]"));
    const panels = Array.from(node.querySelectorAll("[data-panel]"));
    const pluginInputs = Array.from(node.querySelectorAll("[data-plugin-id]"));
    let collapsed = false;

    function setCollapsed(nextCollapsed) {
        collapsed = !!nextCollapsed;
        node.classList.toggle("ef-runtime-menu-collapsed", collapsed);
        if (collapseButton) {
            collapseButton.textContent = collapsed ? "+" : "-";
            collapseButton.setAttribute("aria-pressed", collapsed ? "true" : "false");
            collapseButton.setAttribute("aria-label", collapsed ? "Expand Config Menu" : "Minimize Config Menu");
        }
        writeBooleanPreference(RUNTIME_MENU_COLLAPSED_STORAGE_KEY, collapsed);
    }

    function selectTab(tabName) {
        for (const button of tabButtons) {
            const active = button.getAttribute("data-tab") === tabName;
            button.setAttribute("aria-selected", active ? "true" : "false");
        }
        for (const panel of panels) {
            const active = panel.getAttribute("data-panel") === tabName;
            panel.setAttribute("aria-hidden", active ? "false" : "true");
        }
    }

    function syncPluginVisibility() {
        for (const input of pluginInputs) {
            const pluginId = input.getAttribute("data-plugin-id") || "";
            const visible = pluginVisibility.get(pluginId) !== false;
            input.checked = visible;
            setPluginOverlayVisible(pluginId, visible);
        }
    }

    node.addEventListener("click", (event) => event.stopPropagation());
    node.addEventListener("pointerdown", (event) => event.stopPropagation());
    node.addEventListener("input", (event) => event.stopPropagation());
    collapseButton?.addEventListener("click", (event) => {
        event.preventDefault();
        setCollapsed(!collapsed);
    });
    for (const button of tabButtons) {
        button.addEventListener("click", (event) => {
            event.preventDefault();
            selectTab(button.getAttribute("data-tab") || "general");
        });
    }
    for (const input of pluginInputs) {
        input.addEventListener("change", () => {
            const pluginId = input.getAttribute("data-plugin-id") || "";
            const visible = input.checked === true;
            pluginVisibility.set(pluginId, visible);
            writePluginVisiblePreference(pluginId, visible);
            setPluginOverlayVisible(pluginId, visible);
        });
    }

    setCollapsed(readBooleanPreference(RUNTIME_MENU_COLLAPSED_STORAGE_KEY, false));
    selectTab("general");
    syncPluginVisibility();
    document.body.appendChild(node);
    installDraggableWindow(node, header, "__EF_RUNTIME_CONFIG_POSITION__");
}
