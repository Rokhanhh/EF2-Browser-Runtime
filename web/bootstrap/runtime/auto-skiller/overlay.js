const OVERLAY_ID = "ef-auto-skiller-overlay";

function ensureStyle() {
    if (document.getElementById(`${OVERLAY_ID}-style`)) {
        return;
    }

    const style = document.createElement("style");
    style.id = `${OVERLAY_ID}-style`;
    style.textContent = `
#${OVERLAY_ID} {
  position: fixed;
  top: 42px;
  left: 8px;
  z-index: 2147483647;
  box-sizing: border-box;
  min-width: 220px;
  max-width: calc(100vw - 16px);
  padding: 9px 11px;
  border: 1px solid rgba(255, 224, 138, 0.35);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.72);
  color: #ffe08a;
  font-family: monospace;
  font-size: 12px;
  line-height: 1.25;
  pointer-events: auto;
}
#${OVERLAY_ID}.ef-auto-skiller-collapsed {
  width: 38px;
  height: 38px;
  overflow: hidden;
  padding: 9px 11px;
}
#${OVERLAY_ID}.ef-auto-skiller-collapsed > :not(.ef-auto-skiller-header) {
  display: none !important;
}
#${OVERLAY_ID}.ef-auto-skiller-collapsed .ef-auto-skiller-title {
  display: none !important;
}
#${OVERLAY_ID}.ef-auto-skiller-collapsed .ef-auto-skiller-header {
  min-height: 18px;
}
#${OVERLAY_ID}.ef-auto-skiller-collapsed .ef-auto-skiller-collapse {
  top: -2px;
  left: -4px;
}
#${OVERLAY_ID} .ef-auto-skiller-header {
  position: relative;
  min-height: 20px;
}
#${OVERLAY_ID} .ef-auto-skiller-title {
  font-size: 14px;
  font-weight: 700;
  margin: 0 0 0 24px;
  text-align: center;
}
#${OVERLAY_ID} .ef-auto-skiller-collapse {
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
#${OVERLAY_ID} .ef-auto-skiller-collapse:hover {
  background: rgba(255, 224, 138, 0.22);
}
#${OVERLAY_ID} .ef-auto-skiller-status {
  margin-top: 8px;
  text-align: center;
}
#${OVERLAY_ID} .ef-auto-skiller-hidden {
  display: none !important;
}
#${OVERLAY_ID} .ef-auto-skiller-controls {
  display: grid;
  grid-template-columns: 1fr;
  gap: 7px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 224, 138, 0.20);
}
#${OVERLAY_ID} .ef-auto-skiller-toggle {
  height: 28px;
  border: 1px solid rgba(255, 224, 138, 0.45);
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.32);
  color: #ffe08a;
  font: inherit;
  cursor: pointer;
}
#${OVERLAY_ID} .ef-auto-skiller-toggle[aria-pressed="true"] {
  background: rgba(255, 224, 138, 0.22);
  border-color: rgba(255, 224, 138, 0.70);
}
#${OVERLAY_ID} .ef-auto-skiller-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 6px;
  margin-top: 8px;
}
#${OVERLAY_ID} .ef-auto-skiller-row {
  display: grid;
  grid-template-columns: minmax(72px, 1fr) 58px 34px;
  gap: 6px;
  align-items: center;
}
#${OVERLAY_ID} .ef-auto-skiller-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
#${OVERLAY_ID} .ef-auto-skiller-press {
  min-width: 0;
  height: 28px;
  border: 1px solid rgba(255, 224, 138, 0.42);
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.28);
  color: #ffe08a;
  font: inherit;
  font-size: 11px;
  line-height: 1.1;
  cursor: pointer;
  overflow-wrap: anywhere;
}
#${OVERLAY_ID} .ef-auto-skiller-press[data-state="cooldown"],
#${OVERLAY_ID} .ef-auto-skiller-press:disabled {
  background: rgba(0, 0, 0, 0.18);
  border-color: rgba(255, 224, 138, 0.28);
  cursor: default;
}
#${OVERLAY_ID} .ef-auto-skiller-slot-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
}
#${OVERLAY_ID} .ef-auto-skiller-slot-toggle input {
  width: 16px;
  height: 16px;
  margin: 0;
}
`;
    document.head.appendChild(style);
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function formatDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) {
        return "--";
    }
    const whole = Math.max(0, Math.ceil(seconds));
    const minutes = Math.floor(whole / 60);
    const secs = whole % 60;
    return minutes > 0 ? `${minutes}m ${secs}s` : `${secs}s`;
}

function formatButtonLabel(slot) {
    if (!slot || typeof slot !== "object") {
        return "--";
    }
    if (slot.availability === "Available") {
        return "Ready";
    }
    if (Number.isFinite(slot.timerSec) && slot.timerSec > 0) {
        return formatDuration(slot.timerSec);
    }
    return slot.hasButton ? "Wait" : "Missing";
}

function getSlotKey(slot, fallbackIndex) {
    const slotIndex = Number.isFinite(slot?.slot) ? Math.max(0, Math.floor(slot.slot) - 1) : fallbackIndex;
    return `slot:${slotIndex}`;
}

function buildRowsHtml(state) {
    const activeSkillSlots = Array.isArray(state.activeSkillSlots) ? state.activeSkillSlots : [];
    const enabledMap = state.autoSkillEnabledKeys && typeof state.autoSkillEnabledKeys === "object"
        ? state.autoSkillEnabledKeys
        : {};

    return activeSkillSlots
        .slice(0, 3)
        .map((slot, index) => {
            const slotIndex = Number.isFinite(slot?.slot) ? Math.max(0, Math.floor(slot.slot) - 1) : index;
            const slotKey = getSlotKey(slot, index);
            const isAutoEnabled = enabledMap[slotKey] !== false;
            const stateName = slot?.availability === "Available" ? "ready" : "cooldown";
            const canPress = slot?.hasButton === true;
            return `<div class="ef-auto-skiller-row">
  <div class="ef-auto-skiller-name" title="${escapeHtml(slot?.name || `Slot ${index + 1}`)}">${escapeHtml(slot?.name || `Slot ${index + 1}`)}</div>
  <button class="ef-auto-skiller-press" data-skill-slot="${slotIndex}" data-state="${escapeHtml(stateName)}" type="button"${canPress ? "" : " disabled"}>${escapeHtml(formatButtonLabel(slot))}</button>
  <label class="ef-auto-skiller-slot-toggle" title="Enable auto for this slot"><input data-auto-slot-key="${escapeHtml(slotKey)}" type="checkbox"${isAutoEnabled ? " checked" : ""}></label>
</div>`;
        })
        .join("");
}

export function createAutoSkillerOverlay() {
    ensureStyle();

    const node = document.createElement("div");
    node.id = OVERLAY_ID;
    node.innerHTML = `
<div class="ef-auto-skiller-header">
  <div class="ef-auto-skiller-title">Auto Skills</div>
  <button class="ef-auto-skiller-collapse" data-action="toggleCollapse" type="button" aria-label="Minimize Auto Skills" title="Minimize Auto Skills">-</button>
</div>
<div class="ef-auto-skiller-status">Scanning game state...</div>
<div class="ef-auto-skiller-controls">
  <button class="ef-auto-skiller-toggle" data-action="toggleAutoSkills" aria-pressed="false" type="button">Auto Skills: Off</button>
</div>
<div class="ef-auto-skiller-list"></div>
`;

    const status = node.querySelector(".ef-auto-skiller-status");
    const toggleButton = node.querySelector('[data-action="toggleAutoSkills"]');
    const collapseButton = node.querySelector('[data-action="toggleCollapse"]');
    const list = node.querySelector(".ef-auto-skiller-list");
    let collapsed = false;

    document.body.appendChild(node);

    function setCollapsed(nextCollapsed) {
        collapsed = !!nextCollapsed;
        node.classList.toggle("ef-auto-skiller-collapsed", collapsed);
        if (collapseButton) {
            collapseButton.textContent = collapsed ? "+" : "-";
            collapseButton.setAttribute("aria-pressed", collapsed ? "true" : "false");
            collapseButton.setAttribute("aria-label", collapsed ? "Expand Auto Skills" : "Minimize Auto Skills");
            collapseButton.title = collapsed ? "Expand Auto Skills" : "Minimize Auto Skills";
        }
    }

    function stopOverlayEvent(event) {
        event.stopPropagation();
    }

    for (const element of [toggleButton, collapseButton, list]) {
        element?.addEventListener("click", stopOverlayEvent);
        element?.addEventListener("pointerdown", stopOverlayEvent);
    }

    collapseButton?.addEventListener("click", (event) => {
        event.preventDefault();
        setCollapsed(!collapsed);
    });
    setCollapsed(false);

    return {
        setScanning(message = "Scanning game state...") {
            if (status) {
                status.textContent = message;
            }
        },
        setState(state) {
            if (status) {
                const count = Array.isArray(state.activeSkillSlots) ? state.activeSkillSlots.length : 0;
                status.textContent = count > 0 ? "" : "Waiting for active skills";
                status.classList.toggle("ef-auto-skiller-hidden", count > 0);
            }
            if (list) {
                list.innerHTML = buildRowsHtml(state);
            }
        },
        setError(message) {
            if (status) {
                status.textContent = message;
                status.classList.toggle("ef-auto-skiller-hidden", false);
            }
        },
        setAutoSkillState(enabled) {
            if (toggleButton) {
                toggleButton.textContent = `Auto Skills: ${enabled ? "On" : "Off"}`;
                toggleButton.setAttribute("aria-pressed", enabled ? "true" : "false");
            }
        },
        onAutoSkillToggle(listener) {
            toggleButton?.addEventListener("click", (event) => {
                event.preventDefault();
                listener();
            });
        },
        onSlotAutoToggle(listener) {
            list?.addEventListener("change", (event) => {
                const input = event.target?.closest?.("[data-auto-slot-key]");
                if (!input) {
                    return;
                }
                listener(input.getAttribute("data-auto-slot-key") || "", input.checked === true);
            });
        },
        onSkillAction(listener) {
            let lastActionAt = 0;
            let lastActionSlot = NaN;
            const handleSkillAction = (event) => {
                const target = event.target?.nodeType === Node.ELEMENT_NODE
                    ? event.target
                    : event.target?.parentElement;
                const button = target?.closest?.("[data-skill-slot]");
                if (!button || button.disabled) {
                    return;
                }
                const slotIndex = Number(button.getAttribute("data-skill-slot"));
                if (!Number.isFinite(slotIndex)) {
                    return;
                }
                const now = performance.now();
                if (slotIndex === lastActionSlot && now - lastActionAt < 250) {
                    event.preventDefault();
                    return;
                }
                lastActionAt = now;
                lastActionSlot = slotIndex;
                event.preventDefault();
                listener(slotIndex);
            };
            list?.addEventListener("pointerdown", handleSkillAction);
            list?.addEventListener("click", handleSkillAction);
        },
        remove() {
            node.remove();
        }
    };
}
