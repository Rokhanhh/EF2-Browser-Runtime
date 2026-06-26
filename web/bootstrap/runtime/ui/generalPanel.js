import { escapeHtml } from "./html.js";

const RUNTIME_SETTINGS_URL = "/__ef_runtime_settings__";
const PRESET_LABELS = {
    original: "Original",
    tall: "Tall",
    extraTall: "Extra",
    fullTitle: "Full",
};

function getInitialOpenAtStart() {
    const config = window.__EF_RUNTIME_CONFIG__;
    return config && config.openAtStart === true;
}

function getInitialGameViewport() {
    const config = window.__EF_RUNTIME_CONFIG__;
    return config && config.gameViewport && typeof config.gameViewport === "object" ? config.gameViewport : {};
}

function renderViewportPresetOptions() {
    const gameViewport = getInitialGameViewport();
    const presets = gameViewport.presets && typeof gameViewport.presets === "object" ? gameViewport.presets : {};
    const selectedPreset = typeof gameViewport.preset === "string" ? gameViewport.preset : "original";
    const keys = Object.keys(presets).length ? Object.keys(presets) : ["original", "tall", "extraTall", "fullTitle"];
    return keys.map(key => {
        const selected = key === selectedPreset ? " selected" : "";
        return `<option value="${escapeHtml(key)}"${selected}>${escapeHtml(PRESET_LABELS[key] || key)}</option>`;
    }).join("");
}

export function renderGeneralPanel() {
    const currentPort = window.location.port || (window.location.protocol === "https:" ? "443" : "80");
    const openAtStartChecked = getInitialOpenAtStart() ? " checked" : "";
    return `
  <div class="ef-runtime-panel" data-panel="general" role="tabpanel" aria-hidden="false">
    <label class="ef-runtime-general-row">
      <span>Port</span>
      <span class="ef-runtime-general-value" aria-disabled="true">${escapeHtml(currentPort)}</span>
    </label>
    <label class="ef-runtime-general-row">
      <span>Open at start</span>
      <span class="ef-runtime-general-toggle"><input data-runtime-setting="openAtStart" type="checkbox"${openAtStartChecked}></span>
    </label>
    <label class="ef-runtime-general-row">
      <span>Game size</span>
      <select class="ef-runtime-general-select" data-runtime-setting="gameViewportPreset">${renderViewportPresetOptions()}</select>
    </label>
  </div>`;
}

export function bindGeneralSettingsControls(node) {
    const openAtStartInput = node.querySelector('[data-runtime-setting="openAtStart"]');
    const gameViewportPresetInput = node.querySelector('[data-runtime-setting="gameViewportPreset"]');

    openAtStartInput?.addEventListener("change", async () => {
        const nextValue = openAtStartInput.checked === true;
        openAtStartInput.disabled = true;
        try {
            const response = await fetch(RUNTIME_SETTINGS_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ openAtStart: nextValue })
            });
            if (!response.ok) {
                throw new Error(`settings update failed (${response.status})`);
            }
            const settings = await response.json();
            openAtStartInput.checked = settings.openAtStart === true;
            if (window.__EF_RUNTIME_CONFIG__) {
                window.__EF_RUNTIME_CONFIG__.openAtStart = openAtStartInput.checked;
            }
        } catch (error) {
            openAtStartInput.checked = !nextValue;
            console.warn("[ef-runtime] failed to update runtime setting:", error);
        } finally {
            openAtStartInput.disabled = false;
        }
    });

    gameViewportPresetInput?.addEventListener("change", async () => {
        const previousValue = window.__EF_RUNTIME_CONFIG__?.gameViewport?.preset || "original";
        const nextValue = gameViewportPresetInput.value;
        gameViewportPresetInput.disabled = true;
        try {
            const response = await fetch(RUNTIME_SETTINGS_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ gameViewportPreset: nextValue })
            });
            if (!response.ok) {
                throw new Error(`settings update failed (${response.status})`);
            }
            const settings = await response.json();
            if (window.__EF_RUNTIME_CONFIG__) {
                window.__EF_RUNTIME_CONFIG__.gameViewport = settings.gameViewport;
            }
            gameViewportPresetInput.value = settings.gameViewport?.preset || nextValue;
            window.location.reload();
        } catch (error) {
            gameViewportPresetInput.value = previousValue;
            console.warn("[ef-runtime] failed to update runtime setting:", error);
        } finally {
            gameViewportPresetInput.disabled = false;
        }
    });
}
