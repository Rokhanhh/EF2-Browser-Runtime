import { escapeHtml } from "./html.js";

const RUNTIME_SETTINGS_URL = "/__ef_runtime_settings__";

function getInitialOpenAtStart() {
    const config = window.__EF_RUNTIME_CONFIG__;
    return config && config.openAtStart === true;
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
  </div>`;
}

export function bindGeneralSettingsControls(node) {
    const openAtStartInput = node.querySelector('[data-runtime-setting="openAtStart"]');
    if (!openAtStartInput) {
        return;
    }

    openAtStartInput.addEventListener("change", async () => {
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
}
