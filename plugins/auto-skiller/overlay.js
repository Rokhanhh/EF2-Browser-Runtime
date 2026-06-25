const OVERLAY_ID = "ef-auto-skiller-overlay";
const COLLAPSED_STORAGE_KEY = "__EF_AUTO_SKILLER_COLLAPSED__";
const SIZE_STORAGE_KEY = "__EF_AUTO_SKILLER_SIZE__";

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
  width: 230px;
  min-width: 230px;
  max-width: calc(100vw - 16px);
  min-height: 322px;
  padding: 9px 11px;
  overflow: hidden;
  border: 1px solid rgba(255, 224, 138, 0.35);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.72);
  color: #ffe08a;
  font-family: monospace;
  font-size: 12px;
  line-height: 1.25;
  pointer-events: auto;
}
#${OVERLAY_ID} .ef-auto-skiller-resize {
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: 14px;
  height: 14px;
  cursor: nwse-resize;
  pointer-events: auto;
}
#${OVERLAY_ID} .ef-auto-skiller-resize::after {
  content: "";
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: 8px;
  height: 8px;
  border-right: 1px solid rgba(255, 224, 138, 0.70);
  border-bottom: 1px solid rgba(255, 224, 138, 0.70);
}
#${OVERLAY_ID}.ef-auto-skiller-collapsed {
  min-width: 150px;
  width: 150px;
  min-height: 0;
  height: 38px;
  overflow: hidden;
  padding: 9px 11px;
}
#${OVERLAY_ID}.ef-auto-skiller-collapsed > :not(.ef-auto-skiller-header) {
  display: none !important;
}
#${OVERLAY_ID}.ef-auto-skiller-collapsed .ef-auto-skiller-resize {
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
#${OVERLAY_ID} .ef-auto-skiller-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5px;
}
#${OVERLAY_ID} .ef-auto-skiller-tab {
  height: 26px;
  border: 1px solid rgba(255, 224, 138, 0.35);
  border-radius: 5px;
  background: rgba(0, 0, 0, 0.24);
  color: #ffe08a;
  font: inherit;
  cursor: pointer;
}
#${OVERLAY_ID} .ef-auto-skiller-tab[aria-selected="true"] {
  background: rgba(255, 224, 138, 0.22);
  border-color: rgba(255, 224, 138, 0.70);
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
  align-content: start;
  gap: 6px;
  margin-top: 8px;
  min-height: 204px;
  overflow: hidden;
}
#${OVERLAY_ID} .ef-auto-skiller-row {
  display: grid;
  grid-template-columns: minmax(72px, 1fr) 58px 34px;
  gap: 6px;
  align-items: center;
}
#${OVERLAY_ID} .ef-auto-skiller-row.ef-auto-skiller-wave-filter {
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(255, 224, 138, 0.18);
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
#${OVERLAY_ID} .ef-auto-skiller-press[data-state="cooldown"] {
  background: rgba(0, 0, 0, 0.18);
  border-color: rgba(255, 224, 138, 0.28);
}
#${OVERLAY_ID} .ef-auto-skiller-press:disabled {
  cursor: default;
  opacity: 1;
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
#${OVERLAY_ID} .ef-auto-skiller-percent-input {
  width: 58px;
  min-width: 0;
  height: 28px;
  box-sizing: border-box;
  border: 1px solid rgba(255, 224, 138, 0.42);
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.28);
  color: #ffe08a;
  font: inherit;
  font-size: 11px;
  text-align: center;
}
#${OVERLAY_ID} .ef-auto-skiller-percent-input::-webkit-outer-spin-button,
#${OVERLAY_ID} .ef-auto-skiller-percent-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
#${OVERLAY_ID} .ef-auto-skiller-percent-input[type="number"] {
  appearance: textfield;
  -moz-appearance: textfield;
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

function installResizableWindow(node, handle, storageKey, { minWidth, minHeight }) {
    if (!node || !handle) {
        return;
    }

    function readSize() {
        try {
            const size = JSON.parse(window.localStorage.getItem(storageKey) || "null");
            if (Number.isFinite(size?.width) && Number.isFinite(size?.height)) {
                return size;
            }
        } catch (error) {
            // Ignore storage errors.
        }
        return null;
    }

    function writeSize(width, height) {
        try {
            window.localStorage.setItem(storageKey, JSON.stringify({ width, height }));
        } catch (error) {
            // Ignore storage errors.
        }
    }

    function setSize(width, height, persist = false) {
        const rect = node.getBoundingClientRect();
        const maxWidth = Math.max(minWidth, window.innerWidth - rect.left);
        const maxHeight = Math.max(minHeight, window.innerHeight - rect.top);
        const nextWidth = Math.min(Math.max(minWidth, width), maxWidth);
        const nextHeight = Math.min(Math.max(minHeight, height), maxHeight);
        node.style.width = `${nextWidth}px`;
        node.style.minWidth = "0";
        node.style.height = `${nextHeight}px`;
        node.style.minHeight = "0";
        if (persist) {
            writeSize(nextWidth, nextHeight);
        }
    }

    const storedSize = readSize();
    if (storedSize) {
        requestAnimationFrame(() => setSize(storedSize.width, storedSize.height));
    }
    node.__efApplyStoredSize = () => {
        const size = readSize();
        if (size) {
            setSize(size.width, size.height);
        }
    };

    handle.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        const rect = node.getBoundingClientRect();
        const startX = event.clientX;
        const startY = event.clientY;
        handle.setPointerCapture?.(event.pointerId);

        const onPointerMove = (moveEvent) => {
            moveEvent.preventDefault();
            setSize(rect.width + moveEvent.clientX - startX, rect.height + moveEvent.clientY - startY);
        };
        const onPointerUp = (upEvent) => {
            handle.releasePointerCapture?.(event.pointerId);
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", onPointerUp);
            const nextRect = node.getBoundingClientRect();
            setSize(nextRect.width, nextRect.height, true);
            upEvent.stopPropagation();
        };

        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp, { once: true });
    });
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

function buildWaveCallHtml(state) {
    if (state.autoSkillMode !== "speed") {
        return "";
    }

    const name = state.waveCallName || "Rage Gauge";
    const available = state.waveCallAvailable === true;
    const ready = available && Number(state.waveCallReadyCount) > 0;
    const enabled = state.waveCallEnabled !== false;
    const amount = available
        ? state.waveCallAmount || "0 / 0"
        : "Missing";
    return `<div class="ef-auto-skiller-row ef-auto-skiller-wave-call">
  <div class="ef-auto-skiller-name">${escapeHtml(name)}</div>
  <button class="ef-auto-skiller-press" data-state="${ready ? "ready" : "cooldown"}" type="button" disabled>${escapeHtml(amount)}</button>
  <label class="ef-auto-skiller-slot-toggle"><input data-wave-call-enabled="true" type="checkbox"${enabled ? " checked" : ""}></label>
</div>`;
}

function buildSpeedSkillTriggerHtml(state) {
    if (state.autoSkillMode !== "speed") {
        return "";
    }

    const enabled = state.speedSkillTriggerEnabled === true;
    const percent = Number.isFinite(Number(state.speedSkillTriggerPercent))
        ? Math.max(1, Math.min(100, Math.floor(Number(state.speedSkillTriggerPercent))))
        : 75;
    return `<div class="ef-auto-skiller-row ef-auto-skiller-speed-trigger">
  <div class="ef-auto-skiller-name">Wave Progress %</div>
  <input class="ef-auto-skiller-percent-input" data-speed-skill-percent="true" type="number" min="1" max="100" step="1" value="${percent}" aria-label="Wave progress skill trigger percent">
  <label class="ef-auto-skiller-slot-toggle"><input data-speed-skill-enabled="true" type="checkbox"${enabled ? " checked" : ""}></label>
</div>`;
}

function buildSpeedWaveFilterHtml(state) {
    if (state.autoSkillMode !== "speed") {
        return "";
    }

    const rawDigit = state.speedWaveEndDigit ?? "";
    const value = /^[0-9]$/.test(String(rawDigit))
        ? String(rawDigit)
        : "";
    const enabled = state.speedWaveEndDigitEnabled === true;
    return `<div class="ef-auto-skiller-row ef-auto-skiller-wave-filter">
  <div class="ef-auto-skiller-name">At Wave</div>
  <input class="ef-auto-skiller-percent-input" data-speed-wave-end-digit="true" type="text" maxlength="1" pattern="[0-9]" value="${escapeHtml(value || "0")}" inputmode="numeric" aria-label="Wave ending digit">
  <label class="ef-auto-skiller-slot-toggle"><input data-speed-wave-end-enabled="true" type="checkbox"${enabled ? " checked" : ""}></label>
</div>`;
}

function buildRowsHtml(state) {
    const activeSkillSlots = Array.isArray(state.activeSkillSlots) ? state.activeSkillSlots : [];
    const enabledMap = state.autoSkillEnabledKeys && typeof state.autoSkillEnabledKeys === "object"
        ? state.autoSkillEnabledKeys
        : {};
    const displaySkillSlots = activeSkillSlots.length > 0
        ? activeSkillSlots.slice(0, 3)
        : state.autoSkillMode === "speed"
            ? []
            : [null, null, null];

    const skillRows = displaySkillSlots
        .map((slot, index) => {
            const slotIndex = Number.isFinite(slot?.slot) ? Math.max(0, Math.floor(slot.slot) - 1) : index;
            const slotKey = getSlotKey(slot, index);
            const isAutoEnabled = enabledMap[slotKey] !== false;
            const stateName = slot?.availability === "Available" ? "ready" : "cooldown";
            return `<div class="ef-auto-skiller-row">
  <div class="ef-auto-skiller-name">${escapeHtml(slot?.name || `Slot ${index + 1}`)}</div>
  <button class="ef-auto-skiller-press" data-state="${escapeHtml(stateName)}" type="button" disabled>${escapeHtml(formatButtonLabel(slot))}</button>
  <label class="ef-auto-skiller-slot-toggle"><input data-auto-slot-key="${escapeHtml(slotKey)}" type="checkbox"${isAutoEnabled ? " checked" : ""}></label>
</div>`;
        })
        .join("");
    return `${buildWaveCallHtml(state)}${buildSpeedSkillTriggerHtml(state)}${buildSpeedWaveFilterHtml(state)}${skillRows}`;
}

export function createAutoSkillerOverlay() {
    ensureStyle();

    const node = document.createElement("div");
    node.id = OVERLAY_ID;
    node.innerHTML = `
<div class="ef-auto-skiller-header">
  <div class="ef-auto-skiller-title">Auto Skills</div>
  <button class="ef-auto-skiller-collapse" data-action="toggleCollapse" type="button" aria-label="Minimize Auto Skills">-</button>
</div>
<div class="ef-auto-skiller-status">Scanning</div>
<div class="ef-auto-skiller-controls">
  <div class="ef-auto-skiller-tabs" role="tablist" aria-label="Auto skill mode">
    <button class="ef-auto-skiller-tab" data-mode="push" role="tab" aria-selected="true" type="button">Push</button>
    <button class="ef-auto-skiller-tab" data-mode="speed" role="tab" aria-selected="false" type="button">Speed</button>
  </div>
  <button class="ef-auto-skiller-toggle" data-action="toggleAutoSkills" aria-pressed="false" type="button">Auto Skills: Off</button>
</div>
<div class="ef-auto-skiller-list"></div>
<div class="ef-auto-skiller-resize" aria-hidden="true"></div>
`;

    const status = node.querySelector(".ef-auto-skiller-status");
    const header = node.querySelector(".ef-auto-skiller-header");
    const toggleButton = node.querySelector('[data-action="toggleAutoSkills"]');
    const collapseButton = node.querySelector('[data-action="toggleCollapse"]');
    const resizeHandle = node.querySelector(".ef-auto-skiller-resize");
    const modeButtons = Array.from(node.querySelectorAll("[data-mode]"));
    const list = node.querySelector(".ef-auto-skiller-list");
    let collapsed = false;
    let listInteractionHoldUntil = 0;

    document.body.appendChild(node);
    installDraggableWindow(node, header, "__EF_AUTO_SKILLER_POSITION__");
    installResizableWindow(node, resizeHandle, SIZE_STORAGE_KEY, { minWidth: 230, minHeight: 220 });

    function setCollapsed(nextCollapsed) {
        collapsed = !!nextCollapsed;
        node.classList.toggle("ef-auto-skiller-collapsed", collapsed);
        if (collapsed) {
            node.style.width = "";
            node.style.height = "";
            node.style.minWidth = "";
            node.style.minHeight = "";
        } else {
            node.__efApplyStoredSize?.();
        }
        if (collapseButton) {
            collapseButton.textContent = collapsed ? "+" : "-";
            collapseButton.setAttribute("aria-pressed", collapsed ? "true" : "false");
            collapseButton.setAttribute("aria-label", collapsed ? "Expand Auto Skills" : "Minimize Auto Skills");
        }
        writeBooleanPreference(COLLAPSED_STORAGE_KEY, collapsed);
    }

    function stopOverlayEvent(event) {
        event.stopPropagation();
    }

    function holdListRender() {
        listInteractionHoldUntil = performance.now() + 250;
    }

    for (const element of [toggleButton, collapseButton, list, ...modeButtons]) {
        element?.addEventListener("click", stopOverlayEvent);
        element?.addEventListener("pointerdown", stopOverlayEvent);
        element?.addEventListener("input", stopOverlayEvent);
    }
    list?.addEventListener("pointerdown", holdListRender);
    list?.addEventListener("input", holdListRender);
    list?.addEventListener("change", holdListRender);

    collapseButton?.addEventListener("click", (event) => {
        event.preventDefault();
        setCollapsed(!collapsed);
    });
    if (list) {
        list.innerHTML = buildRowsHtml({ autoSkillMode: "push" });
    }
    setCollapsed(readBooleanPreference(COLLAPSED_STORAGE_KEY, false));

    return {
        setScanning(message = "Scanning...") {
            if (status) {
                status.textContent = message;
            }
        },
        setState(state) {
            if (status) {
                const count = Array.isArray(state.activeSkillSlots) ? state.activeSkillSlots.length : 0;
                const mode = state.autoSkillMode === "speed" ? "speed" : "push";
                const waitingForWaveCall = mode === "speed" && state.waveCallEnabled !== false && state.waveCallAvailable !== true;
                status.textContent = count > 0
                    ? waitingForWaveCall ? "Waiting for wave call" : ""
                    : "";
                status.classList.toggle("ef-auto-skiller-hidden", count > 0 && !waitingForWaveCall);
            }
            const focusedElement = document.activeElement?.nodeType === Node.ELEMENT_NODE
                ? document.activeElement
                : null;
            const focusedEditable = focusedElement?.matches?.("[data-speed-wave-end-digit], [data-speed-skill-percent]") === true;
            if (list && !focusedEditable && (performance.now() >= listInteractionHoldUntil || list.children.length === 0)) {
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
        setMode(mode) {
            const normalizedMode = mode === "speed" ? "speed" : "push";
            for (const button of modeButtons) {
                const active = button.getAttribute("data-mode") === normalizedMode;
                button.setAttribute("aria-selected", active ? "true" : "false");
            }
        },
        onAutoSkillToggle(listener) {
            toggleButton?.addEventListener("click", (event) => {
                event.preventDefault();
                listener();
            });
        },
        onModeChange(listener) {
            for (const button of modeButtons) {
                button.addEventListener("click", (event) => {
                    event.preventDefault();
                    listener(button.getAttribute("data-mode") || "push");
                });
            }
        },
        onSlotAutoToggle(listener) {
            list?.addEventListener("change", (event) => {
                const waveCallInput = event.target?.closest?.("[data-wave-call-enabled]");
                const speedSkillInput = event.target?.closest?.("[data-speed-skill-enabled]");
                if (waveCallInput || speedSkillInput) {
                    return;
                }
                const input = event.target?.closest?.("[data-auto-slot-key]");
                if (!input) {
                    return;
                }
                listener(input.getAttribute("data-auto-slot-key") || "", input.checked === true);
            });
        },
        onWaveCallToggle(listener) {
            list?.addEventListener("change", (event) => {
                const input = event.target?.closest?.("[data-wave-call-enabled]");
                if (!input) {
                    return;
                }
                listener(input.checked === true);
            });
        },
        onSpeedSkillTriggerChange(listener) {
            const readPercent = () => {
                const input = list?.querySelector?.("[data-speed-skill-percent]");
                const parsed = Number(input?.value);
                return Number.isFinite(parsed) ? parsed : NaN;
            };
            const handleEvent = (event) => {
                const enabledInput = event.target?.closest?.("[data-speed-skill-enabled]");
                if (enabledInput) {
                    listener({
                        enabled: enabledInput.checked === true,
                        percent: readPercent()
                    });
                    return;
                }
                const percentInput = event.target?.closest?.("[data-speed-skill-percent]");
                if (percentInput) {
                    const normalized = Math.max(1, Math.min(100, Math.floor(Number(percentInput.value) || 1)));
                    if (String(normalized) !== percentInput.value) {
                        percentInput.value = String(normalized);
                    }
                    listener({
                        percent: normalized
                    });
                }
            };
            list?.addEventListener("change", handleEvent);
            list?.addEventListener("input", handleEvent);
        },
        onSpeedWaveEndDigitChange(listener) {
            const handleEvent = (event) => {
                const enabledInput = event.target?.closest?.("[data-speed-wave-end-enabled]");
                if (enabledInput) {
                    listener({
                        enabled: enabledInput.checked === true
                    });
                    return;
                }
                const digitInput = event.target?.closest?.("[data-speed-wave-end-digit]");
                if (!digitInput) {
                    return;
                }
                const digits = String(digitInput.value || "").replace(/\D/g, "");
                const rawValue = digits ? digits.slice(-1) : "0";
                if (digitInput.value !== rawValue) {
                    digitInput.value = rawValue;
                }
                listener({
                    digit: rawValue
                });
            };
            list?.addEventListener("focusin", (event) => {
                const digitInput = event.target?.closest?.("[data-speed-wave-end-digit]");
                if (!digitInput) {
                    return;
                }
                window.setTimeout(() => {
                    digitInput.select?.();
                }, 0);
            });
            list?.addEventListener("change", handleEvent);
            list?.addEventListener("input", handleEvent);
        },
        remove() {
            node.remove();
        }
    };
}
