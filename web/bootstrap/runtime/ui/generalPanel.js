import { escapeHtml } from "./html.js";

export function renderGeneralPanel() {
    const currentPort = window.location.port || (window.location.protocol === "https:" ? "443" : "80");
    return `
  <div class="ef-runtime-panel" data-panel="general" role="tabpanel" aria-hidden="false">
    <label class="ef-runtime-general-row">
      <span>Port</span>
      <span class="ef-runtime-general-value" aria-disabled="true">${escapeHtml(currentPort)}</span>
    </label>
  </div>`;
}
