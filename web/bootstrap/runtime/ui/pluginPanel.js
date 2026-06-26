import { escapeHtml } from "./html.js";

const PLUGIN_VISIBLE_STORAGE_PREFIX = "__EF_RUNTIME_PLUGIN_VISIBLE__";
const PLUGIN_OVERLAY_ATTRIBUTE = "data-ef-plugin-overlay";

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

function legacyPluginOverlayIds(pluginId) {
    return [`ef-${pluginId}-overlay`];
}

function setPluginOverlayVisible(pluginId, visible) {
    const overlays = document.querySelectorAll(`[${PLUGIN_OVERLAY_ATTRIBUTE}]`);
    for (const overlay of overlays) {
        if (overlay.getAttribute(PLUGIN_OVERLAY_ATTRIBUTE) !== pluginId) {
            continue;
        }
        overlay.style.display = visible ? "" : "none";
    }

    for (const overlayId of legacyPluginOverlayIds(pluginId)) {
        const overlay = document.getElementById(overlayId);
        if (overlay) {
            overlay.style.display = visible ? "" : "none";
        }
    }
}

function syncOverlayElementVisibility(overlay, pluginVisibility) {
    const pluginId = overlay.getAttribute(PLUGIN_OVERLAY_ATTRIBUTE) || "";
    if (!pluginVisibility.has(pluginId)) {
        return;
    }
    const visible = pluginVisibility.get(pluginId) !== false;
    overlay.style.display = visible ? "" : "none";
}

function syncPotentialOverlayElementVisibility(overlay, pluginVisibility) {
    if (overlay.hasAttribute(PLUGIN_OVERLAY_ATTRIBUTE)) {
        syncOverlayElementVisibility(overlay, pluginVisibility);
        return;
    }

    const overlayId = overlay.id || "";
    if (!overlayId) {
        return;
    }
    for (const [pluginId, visible] of pluginVisibility.entries()) {
        if (legacyPluginOverlayIds(pluginId).includes(overlayId)) {
            overlay.style.display = visible !== false ? "" : "none";
            return;
        }
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

export function observePluginOverlayVisibility(pluginVisibility) {
    for (const overlay of document.querySelectorAll(`[${PLUGIN_OVERLAY_ATTRIBUTE}]`)) {
        syncOverlayElementVisibility(overlay, pluginVisibility);
    }

    if (!document.body || typeof MutationObserver !== "function") {
        return () => {};
    }

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (!(node instanceof Element)) {
                    continue;
                }
                syncPotentialOverlayElementVisibility(node, pluginVisibility);
                for (const child of node.querySelectorAll("*")) {
                    syncPotentialOverlayElementVisibility(child, pluginVisibility);
                }
            }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
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
