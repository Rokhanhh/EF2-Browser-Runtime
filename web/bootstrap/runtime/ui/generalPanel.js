import { escapeHtml } from "./html.js";
import { RUNTIME_TOKEN, RUNTIME_TOKEN_HEADER } from "../config.js";

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

function getViewportPresetItems() {
    const gameViewport = getInitialGameViewport();
    const presets = gameViewport.presets && typeof gameViewport.presets === "object" ? gameViewport.presets : {};
    const selectedPreset = typeof gameViewport.preset === "string" ? gameViewport.preset : "original";
    const keys = Object.keys(presets).length ? Object.keys(presets) : ["original", "tall", "extraTall", "fullTitle"];
    return keys.map(key => ({
        key,
        label: PRESET_LABELS[key] || key,
        selected: key === selectedPreset
    }));
}

function renderViewportPresetOptions(items) {
    return items.map(item => {
        const selected = item.selected ? " selected" : "";
        return `<option value="${escapeHtml(item.key)}"${selected}>${escapeHtml(item.label)}</option>`;
    }).join("");
}

function renderViewportPresetChoices(items) {
    return items.map(item => {
        const selected = item.selected ? ' aria-selected="true"' : ' aria-selected="false"';
        return `<button class="ef-runtime-general-select-option" data-runtime-select-option="${escapeHtml(item.key)}" role="option" type="button"${selected}>${escapeHtml(item.label)}</button>`;
    }).join("");
}

export function renderGeneralPanel() {
    const currentPort = window.location.port || (window.location.protocol === "https:" ? "443" : "80");
    const openAtStartChecked = getInitialOpenAtStart() ? " checked" : "";
    const viewportPresetItems = getViewportPresetItems();
    const selectedViewportPreset = viewportPresetItems.find(item => item.selected) || viewportPresetItems[0];
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
    <div class="ef-runtime-general-row">
      <span>Game size</span>
      <span class="ef-runtime-general-select-wrap" data-runtime-select="gameViewportPreset">
        <select class="ef-runtime-general-select" data-runtime-setting="gameViewportPreset" tabindex="-1" aria-hidden="true">${renderViewportPresetOptions(viewportPresetItems)}</select>
        <button class="ef-runtime-general-select-button" data-runtime-select-button type="button" aria-haspopup="listbox" aria-expanded="false">${escapeHtml(selectedViewportPreset?.label || "Original")}</button>
        <span class="ef-runtime-general-select-menu" data-runtime-select-menu role="listbox">${renderViewportPresetChoices(viewportPresetItems)}</span>
      </span>
    </div>
  </div>`;
}

export function bindGeneralSettingsControls(node) {
    const openAtStartInput = node.querySelector('[data-runtime-setting="openAtStart"]');
    const gameViewportPresetInput = node.querySelector('[data-runtime-setting="gameViewportPreset"]');
    const gameViewportPresetWrap = node.querySelector('[data-runtime-select="gameViewportPreset"]');
    const gameViewportPresetButton = gameViewportPresetWrap?.querySelector("[data-runtime-select-button]");
    const gameViewportPresetMenu = gameViewportPresetWrap?.querySelector("[data-runtime-select-menu]");
    const gameViewportPresetOptions = Array.from(gameViewportPresetWrap?.querySelectorAll("[data-runtime-select-option]") || []);

    function closeGameViewportPresetMenu() {
        gameViewportPresetWrap?.classList.remove("is-open");
        gameViewportPresetButton?.setAttribute("aria-expanded", "false");
    }

    function syncGameViewportPresetMenu() {
        if (!gameViewportPresetInput || !gameViewportPresetButton) {
            return;
        }
        const selectedOption = gameViewportPresetInput.selectedOptions[0];
        gameViewportPresetButton.textContent = selectedOption?.textContent || gameViewportPresetInput.value;
        for (const option of gameViewportPresetOptions) {
            option.setAttribute("aria-selected", option.getAttribute("data-runtime-select-option") === gameViewportPresetInput.value ? "true" : "false");
        }
    }

    function setGameViewportPresetDisabled(disabled) {
        if (gameViewportPresetInput) {
            gameViewportPresetInput.disabled = disabled;
        }
        if (gameViewportPresetButton) {
            gameViewportPresetButton.disabled = disabled;
        }
        for (const option of gameViewportPresetOptions) {
            option.disabled = disabled;
        }
        if (disabled) {
            closeGameViewportPresetMenu();
        }
    }

    gameViewportPresetButton?.addEventListener("click", (event) => {
        event.preventDefault();
        if (!gameViewportPresetWrap || gameViewportPresetButton.disabled) {
            return;
        }
        const nextOpen = !gameViewportPresetWrap.classList.contains("is-open");
        gameViewportPresetWrap.classList.toggle("is-open", nextOpen);
        gameViewportPresetButton.setAttribute("aria-expanded", nextOpen ? "true" : "false");
    });

    gameViewportPresetMenu?.addEventListener("click", (event) => {
        event.preventDefault();
        const target = event.target instanceof Element ? event.target : null;
        const option = target?.closest("[data-runtime-select-option]");
        if (!option || !gameViewportPresetInput) {
            return;
        }
        const nextValue = option.getAttribute("data-runtime-select-option") || gameViewportPresetInput.value;
        if (nextValue === gameViewportPresetInput.value) {
            closeGameViewportPresetMenu();
            return;
        }
        gameViewportPresetInput.value = nextValue;
        syncGameViewportPresetMenu();
        closeGameViewportPresetMenu();
        gameViewportPresetInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    document.addEventListener("pointerdown", (event) => {
        if (!gameViewportPresetWrap?.contains(event.target)) {
            closeGameViewportPresetMenu();
        }
    }, true);

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeGameViewportPresetMenu();
        }
    });

    openAtStartInput?.addEventListener("change", async () => {
        const nextValue = openAtStartInput.checked === true;
        openAtStartInput.disabled = true;
        try {
            const response = await fetch(RUNTIME_SETTINGS_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    [RUNTIME_TOKEN_HEADER]: RUNTIME_TOKEN
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
        setGameViewportPresetDisabled(true);
        try {
            const response = await fetch(RUNTIME_SETTINGS_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    [RUNTIME_TOKEN_HEADER]: RUNTIME_TOKEN
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
            syncGameViewportPresetMenu();
        } catch (error) {
            gameViewportPresetInput.value = previousValue;
            syncGameViewportPresetMenu();
            console.warn("[ef-runtime] failed to update runtime setting:", error);
        } finally {
            setGameViewportPresetDisabled(false);
        }
    });

    syncGameViewportPresetMenu();
}
