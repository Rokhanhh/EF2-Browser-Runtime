import { installDraggableWindow } from "./draggableWindow.js";
import { renderGeneralPanel } from "./generalPanel.js";
import {
    bindPluginVisibilityControls,
    createPluginVisibility,
    normalizePluginItems,
    renderPluginPanel,
    syncPluginVisibility
} from "./pluginPanel.js";
import { readBooleanPreference, writeBooleanPreference } from "./preferences.js";

const RUNTIME_MENU_ID = "ef-runtime-menu";
const RUNTIME_MENU_COLLAPSED_STORAGE_KEY = "__EF_RUNTIME_CONFIG_COLLAPSED__";
const RUNTIME_MENU_POSITION_STORAGE_KEY = "__EF_RUNTIME_CONFIG_POSITION__";

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

function selectTab(tabButtons, panels, tabName) {
    for (const button of tabButtons) {
        const active = button.getAttribute("data-tab") === tabName;
        button.setAttribute("aria-selected", active ? "true" : "false");
    }
    for (const panel of panels) {
        const active = panel.getAttribute("data-panel") === tabName;
        panel.setAttribute("aria-hidden", active ? "false" : "true");
    }
}

export function installRuntimeMenu(plugins = []) {
    if (!document.body || document.getElementById(RUNTIME_MENU_ID)) {
        return;
    }

    ensureRuntimeMenuStyle();

    const pluginItems = normalizePluginItems(plugins);
    const pluginVisibility = createPluginVisibility(pluginItems);
    const node = document.createElement("div");
    node.id = RUNTIME_MENU_ID;
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
${renderGeneralPanel()}
${renderPluginPanel(pluginItems)}
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
            selectTab(tabButtons, panels, button.getAttribute("data-tab") || "general");
        });
    }
    bindPluginVisibilityControls(pluginInputs, pluginVisibility);

    setCollapsed(readBooleanPreference(RUNTIME_MENU_COLLAPSED_STORAGE_KEY, false));
    selectTab(tabButtons, panels, "general");
    syncPluginVisibility(pluginInputs, pluginVisibility);
    document.body.appendChild(node);
    installDraggableWindow(node, header, RUNTIME_MENU_POSITION_STORAGE_KEY);
}
