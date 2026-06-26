import { escapeHtml } from "./html.js";

const PLUGIN_VISIBLE_STORAGE_PREFIX = "__EF_RUNTIME_PLUGIN_VISIBLE__";

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

export function normalizePluginItems(plugins = []) {
    return plugins
        .filter((plugin) => plugin && plugin.id)
        .map((plugin) => ({
            id: String(plugin.id),
            name: String(plugin.name || plugin.id)
        }));
}

export function createPluginVisibility(pluginItems) {
    return new Map(pluginItems.map((plugin) => [plugin.id, readPluginVisiblePreference(plugin.id)]));
}

export function renderPluginPanel(pluginItems) {
    return `
  <div class="ef-runtime-panel" data-panel="plugins" role="tabpanel" aria-hidden="true">
    <div class="ef-runtime-plugin-list">
      ${pluginItems.length > 0
            ? pluginItems.map((plugin) => `<label class="ef-runtime-plugin-row">
        <span class="ef-runtime-plugin-name">${escapeHtml(plugin.name)}</span>
        <span class="ef-runtime-plugin-toggle"><input data-plugin-id="${escapeHtml(plugin.id)}" type="checkbox"></span>
      </label>`).join("")
            : `<div class="ef-runtime-plugin-row"><span class="ef-runtime-plugin-name">No plugins</span></div>`}
    </div>
  </div>`;
}

export function syncPluginVisibility(pluginInputs, pluginVisibility) {
    for (const input of pluginInputs) {
        const pluginId = input.getAttribute("data-plugin-id") || "";
        const visible = pluginVisibility.get(pluginId) !== false;
        input.checked = visible;
        setPluginOverlayVisible(pluginId, visible);
    }
}

export function bindPluginVisibilityControls(pluginInputs, pluginVisibility) {
    for (const input of pluginInputs) {
        input.addEventListener("change", () => {
            const pluginId = input.getAttribute("data-plugin-id") || "";
            const visible = input.checked === true;
            pluginVisibility.set(pluginId, visible);
            writePluginVisiblePreference(pluginId, visible);
            setPluginOverlayVisible(pluginId, visible);
        });
    }
}
