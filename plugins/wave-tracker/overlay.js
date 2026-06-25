const OVERLAY_ID = "ef-wave-overlay";
const MEDAL_BUFF_STORAGE_KEY = "__EF_WAVE_TRACKER_MEDAL_BUFF_PERCENT__";
const MINIMIZED_STORAGE_KEY = "__EF_WAVE_TRACKER_MINIMIZED__";
const SIZE_STORAGE_KEY = "__EF_WAVE_TRACKER_SIZE__";

function formatMinSec(totalSeconds) {
    if (!Number.isFinite(totalSeconds)) {
        return "00:00";
    }
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(seconds / 60);
    return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function ensureStyle() {
    if (document.getElementById(`${OVERLAY_ID}-style`)) {
        return;
    }
    const style = document.createElement("style");
    style.id = `${OVERLAY_ID}-style`;
    style.textContent = `
#${OVERLAY_ID} {
  position: fixed;
  top: 8px;
  right: 8px;
  z-index: 2147483647;
  box-sizing: border-box;
  min-width: 220px;
  padding: 9px 11px;
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid rgba(255, 224, 138, 0.35);
  background: rgba(0, 0, 0, 0.72);
  color: #ffe08a;
  font-family: monospace;
  font-size: 14px;
  line-height: 1.25;
  pointer-events: none;
}
#${OVERLAY_ID} .ef-wave-resize {
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: 14px;
  height: 14px;
  cursor: nwse-resize;
  pointer-events: auto;
}
#${OVERLAY_ID} .ef-wave-resize::after {
  content: "";
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: 8px;
  height: 8px;
  border-right: 1px solid rgba(255, 224, 138, 0.70);
  border-bottom: 1px solid rgba(255, 224, 138, 0.70);
}
#${OVERLAY_ID}.ef-wave-minimized {
  min-width: 170px;
  width: 170px;
  height: 38px;
  padding: 9px 11px;
}
#${OVERLAY_ID}.ef-wave-minimized > :not(.ef-wave-header) {
  display: none !important;
}
#${OVERLAY_ID}.ef-wave-minimized .ef-wave-resize {
  display: none !important;
}
#${OVERLAY_ID}.ef-wave-minimized .ef-wave-header {
  min-height: 18px;
}
#${OVERLAY_ID}.ef-wave-minimized .ef-wave-toggle {
  top: -2px;
  left: -4px;
}
#${OVERLAY_ID} .ef-wave-header {
  position: relative;
  min-height: 20px;
  pointer-events: auto;
}
#${OVERLAY_ID} .ef-wave-title {
  font-weight: 700;
  font-size: 16px;
  letter-spacing: 0.3px;
  margin: 0 0 6px 24px;
  text-align: center;
  white-space: nowrap;
}
#${OVERLAY_ID} .ef-wave-toggle {
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
  pointer-events: auto;
  text-align: center;
}
#${OVERLAY_ID} .ef-wave-toggle:hover {
  background: rgba(255, 224, 138, 0.22);
}
#${OVERLAY_ID} .ef-wave-separator {
  height: 1px;
  background: rgba(255, 224, 138, 0.35);
  margin-bottom: 6px;
}
#${OVERLAY_ID} .ef-wave-separator.bottom {
  margin-top: 6px;
  margin-bottom: 6px;
}
#${OVERLAY_ID} .ef-wave-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  column-gap: 7px;
  row-gap: 6px;
}
#${OVERLAY_ID} .ef-wave-status {
  display: flex;
  justify-content: center;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 2px;
}
#${OVERLAY_ID} .ef-wave-metric {
  display: grid;
  row-gap: 1px;
}
#${OVERLAY_ID} .ef-wave-label {
  opacity: 0.85;
}
#${OVERLAY_ID} .ef-wave-value {
  font-weight: 600;
}
#${OVERLAY_ID} .ef-wave-decision-continue {
  color: #66e28a;
}
#${OVERLAY_ID} .ef-wave-decision-rebirth {
  color: #ff6b6b;
}
#${OVERLAY_ID} .ef-wave-subtitle {
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 0.2px;
  margin-bottom: 4px;
  text-align: center;
}
#${OVERLAY_ID} .ef-wave-separator.medals {
  margin-top: 4px;
  margin-bottom: 0;
}
#${OVERLAY_ID} .ef-wave-medals-body {
  display: grid;
  grid-template-columns: 1fr;
  row-gap: 6px;
  margin-top: 6px;
  overflow: hidden;
}
#${OVERLAY_ID} .ef-wave-medal-buff {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 5px;
  margin-top: 8px;
  pointer-events: auto;
}
#${OVERLAY_ID} .ef-wave-medal-buff .ef-wave-label {
  white-space: nowrap;
}
#${OVERLAY_ID} .ef-wave-medal-buff-input {
  width: 52px;
  height: 22px;
  box-sizing: border-box;
  border: 1px solid rgba(255, 224, 138, 0.45);
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.55);
  color: #ffe08a;
  font: inherit;
  font-size: 12px;
  padding: 1px 4px;
  text-align: right;
}
#${OVERLAY_ID} .ef-wave-medal-buff-button {
  height: 22px;
  border: 1px solid rgba(255, 224, 138, 0.45);
  border-radius: 3px;
  background: rgba(255, 224, 138, 0.12);
  color: #ffe08a;
  font: inherit;
  font-size: 12px;
  padding: 0 5px;
  cursor: pointer;
}
#${OVERLAY_ID} .ef-wave-hidden {
  display: none !important;
}
`;
    document.head.appendChild(style);
}

export class NumberUtil {
    static addZeros(t, i) {
        let s = String(i);
        const e = t - s.length;
        for (let n = 0; n < e; n += 1) {
            s = `0${s}`;
        }
        return s;
    }

    static displayLargeNumberAsAlphabet(i) {
        if (!Number.isFinite(i)) {
            return "-";
        }
        if (i <= 0) {
            return "0";
        }
        if (i < 10000) {
            return Math.floor(i).toString();
        }

        const s = Math.floor(Math.log10(i) / 3);
        const e = i / Math.pow(1000, s);
        const n = this.suffixes[s] || "";
        const h = Math.floor(Math.log10(e)) + 1;
        const r = Math.max(0, 3 - h);

        return parseFloat(e.toFixed(r)).toString() + n;
    }
}

NumberUtil.suffixes = (() => {
    const t = [""];
    for (let i = 0; i < 26; i += 1) {
        t.push(String.fromCharCode(97 + i));
    }
    for (let i = 0; i < 26; i += 1) {
        for (let s = 0; s < 26; s += 1) {
            t.push(String.fromCharCode(97 + i) + String.fromCharCode(97 + s));
        }
    }
    return t;
})();

export function clamp(value, min, max) {
    const number = Number.parseInt(value, 10);
    if (Number.isNaN(number)) {
        return min;
    }
    return Math.min(Math.max(number, min), max);
}

export function formatNumber(value) {
    return NumberUtil.displayLargeNumberAsAlphabet(value);
}

function readStoredMedalBuffPercent() {
    try {
        const parsed = Number.parseInt(window.localStorage.getItem(MEDAL_BUFF_STORAGE_KEY) || "", 10);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    } catch (error) {
        return 0;
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

export function createWaveOverlay() {
    ensureStyle();
    const node = document.createElement("div");
    node.id = OVERLAY_ID;
    node.innerHTML = `
<div class="ef-wave-header">
  <div class="ef-wave-title">Wave Tracker</div>
  <button class="ef-wave-toggle" type="button" aria-label="Minimize Wave Tracker" title="Minimize Wave Tracker">-</button>
</div>
<div class="ef-wave-separator"></div>
<div class="ef-wave-status"></div>
<div class="ef-wave-body"></div>
<div class="ef-wave-separator bottom"></div>
<div class="ef-wave-subtitle">Medal Tracker</div>
<div class="ef-wave-separator medals"></div>
<div class="ef-wave-medals-body"></div>
<div class="ef-wave-medal-buff">
  <div class="ef-wave-label">Medal Buff %</div>
  <input class="ef-wave-medal-buff-input" type="text" inputmode="numeric" pattern="[0-9]*" value="0">
  <button class="ef-wave-medal-buff-button" type="button">Apply</button>
</div>
<div class="ef-wave-resize" aria-hidden="true"></div>
`;
    const topSeparator = node.querySelector(".ef-wave-separator");
    const header = node.querySelector(".ef-wave-header");
    const status = node.querySelector(".ef-wave-status");
    const body = node.querySelector(".ef-wave-body");
    const toggleButton = node.querySelector(".ef-wave-toggle");
    const resizeHandle = node.querySelector(".ef-wave-resize");
    const bottomSeparator = node.querySelector(".ef-wave-separator.bottom");
    const medalsSubtitle = node.querySelector(".ef-wave-subtitle");
    const medalsSeparator = node.querySelector(".ef-wave-separator.medals");
    const medalsBody = node.querySelector(".ef-wave-medals-body");
    const medalBuffControl = node.querySelector(".ef-wave-medal-buff");
    const medalBuffInput = node.querySelector(".ef-wave-medal-buff-input");
    const medalBuffButton = node.querySelector(".ef-wave-medal-buff-button");
    let medalBuffPercent = readStoredMedalBuffPercent();
    let minimized = readBooleanPreference(MINIMIZED_STORAGE_KEY, false);
    let lastMetricsHtml = "";
    let lastStatusHtml = "";
    let lastMedalsHtml = "";
    if (medalBuffInput) {
        medalBuffInput.value = String(medalBuffPercent);
    }

    function setStatsVisible(visible) {
        const className = "ef-wave-hidden";
        for (const element of [topSeparator, body, bottomSeparator, medalsSubtitle, medalsSeparator, medalsBody, medalBuffControl]) {
            if (!element) {
                continue;
            }
            element.classList.toggle(className, !visible);
        }
    }

    function syncMinimizedState() {
        node.classList.toggle("ef-wave-minimized", minimized);
        if (minimized) {
            node.style.width = "";
            node.style.height = "";
            node.style.minWidth = "";
            node.style.minHeight = "";
        } else {
            node.__efApplyStoredSize?.();
        }
        if (toggleButton) {
            toggleButton.textContent = minimized ? "+" : "-";
            toggleButton.setAttribute("aria-label", minimized ? "Expand Wave Tracker" : "Minimize Wave Tracker");
            toggleButton.title = minimized ? "Expand Wave Tracker" : "Minimize Wave Tracker";
        }
        writeBooleanPreference(MINIMIZED_STORAGE_KEY, minimized);
    }

    function renderMetrics(metrics) {
        const nextHtml = metrics.map(({ label, value }) => (
            `<div class="ef-wave-metric"><div class="ef-wave-label">${label}</div><div class="ef-wave-value">${value}</div></div>`
        )).join("");
        if (nextHtml !== lastMetricsHtml) {
            lastMetricsHtml = nextHtml;
            body.innerHTML = nextHtml;
        }
    }

    function renderStatus(label, value) {
        const nextHtml = label
            ? `<span class="ef-wave-label">${label}:</span><span class="ef-wave-value">${value}</span>`
            : "";
        if (nextHtml !== lastStatusHtml) {
            lastStatusHtml = nextHtml;
            status.innerHTML = nextHtml;
        }
    }

    function renderMedalsMetrics(metrics) {
        const nextHtml = metrics.map(({ label, value, valueClass = "" }) => (
            `<div class="ef-wave-metric"><div class="ef-wave-label">${label}</div><div class="ef-wave-value ${valueClass}">${value}</div></div>`
        )).join("");
        if (nextHtml !== lastMedalsHtml) {
            lastMedalsHtml = nextHtml;
            medalsBody.innerHTML = nextHtml;
        }
    }

    function setStatusVisible(visible) {
        status.classList.toggle("ef-wave-hidden", !visible);
    }

    function applyMedalBuffInput() {
        const parsed = Number.parseInt(medalBuffInput?.value || "", 10);
        if (!Number.isFinite(parsed) || parsed < 0) {
            if (medalBuffInput) {
                medalBuffInput.value = String(medalBuffPercent);
            }
            return;
        }
        medalBuffPercent = parsed;
        try {
            window.localStorage.setItem(MEDAL_BUFF_STORAGE_KEY, String(medalBuffPercent));
        } catch (error) {
            // Ignore storage errors.
        }
    }

    for (const element of [medalBuffControl, medalBuffInput, medalBuffButton]) {
        element?.addEventListener("click", (event) => event.stopPropagation());
        element?.addEventListener("pointerdown", (event) => event.stopPropagation());
        element?.addEventListener("keydown", (event) => event.stopPropagation());
    }
    toggleButton?.addEventListener("click", (event) => {
        event.stopPropagation();
        minimized = !minimized;
        syncMinimizedState();
    });
    toggleButton?.addEventListener("pointerdown", (event) => event.stopPropagation());
    toggleButton?.addEventListener("keydown", (event) => event.stopPropagation());
    medalBuffInput?.addEventListener("input", () => {
        medalBuffInput.value = medalBuffInput.value.replace(/\D/g, "");
    });
    medalBuffButton?.addEventListener("click", applyMedalBuffInput);
    medalBuffInput?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            applyMedalBuffInput();
            medalBuffInput.blur();
        }
    });

    setStatsVisible(false);
    setStatusVisible(true);
    renderStatus("Status", "scanning");
    document.body.appendChild(node);
    installDraggableWindow(node, header, "__EF_WAVE_TRACKER_POSITION__");
    installResizableWindow(node, resizeHandle, SIZE_STORAGE_KEY, { minWidth: 220, minHeight: 180 });

    return {
        setScanning() {
            setStatsVisible(false);
            setStatusVisible(true);
            renderStatus("Status", "scanning");
            syncMinimizedState();
        },
        setBattle({
            wave,
            maxWave,
            rebirthTimeSec,
            wpm,
            wpmReady,
            waveTimeSec,
            waveSpan10TotalSec,
            waveSpan10FromWave,
            waveSpan10ToWave,
            waveAvg10Sec,
            waveAvg100Sec,
            completedWaves,
            skippedWaves,
            medalsAtCurrentWave,
            medalMpmState,
            bestMpmState
        }) {
            const safeWave = Number.isFinite(wave) ? Math.floor(wave) : "-";
            const safeMaxWave = Number.isFinite(maxWave) ? Math.floor(maxWave) : "syncing";
            const safeRebirthTime = formatMinSec(rebirthTimeSec);
            const safeWaveTime = Number.isFinite(waveTimeSec) ? waveTimeSec.toFixed(2) : "-";
            const safeWaveSpan10Total = Number.isFinite(waveSpan10TotalSec) ? waveSpan10TotalSec.toFixed(2) : "-";
            const waveSpan10From = Number.isFinite(waveSpan10FromWave)
                ? Math.floor(waveSpan10FromWave)
                : Number.isFinite(wave)
                    ? Math.floor(wave / 10) * 10
                    : NaN;
            const waveSpan10To = Number.isFinite(waveSpan10ToWave)
                ? Math.floor(waveSpan10ToWave)
                : Number.isFinite(waveSpan10From)
                    ? waveSpan10From + 10
                    : NaN;
            const waveSpan10Label = Number.isFinite(waveSpan10From) && Number.isFinite(waveSpan10To)
                ? `Time Wave ${waveSpan10From}-${waveSpan10To}`
                : "10 wave time";
            const safeWaveAvg10 = Number.isFinite(waveAvg10Sec) ? waveAvg10Sec.toFixed(2) : "0.00";
            const safeWaveAvg100 = Number.isFinite(waveAvg100Sec) ? waveAvg100Sec.toFixed(2) : "0.00";
            const safeWpm = wpmReady && Number.isFinite(wpm) ? wpm.toFixed(2) : "warming up";
            const safeCompletedWaves = Number.isFinite(completedWaves) ? Math.floor(completedWaves) : 0;
            const safeSkippedWaves = Number.isFinite(skippedWaves) ? Math.floor(skippedWaves) : 0;
            const medalValue = Number.isFinite(medalsAtCurrentWave?.medal) ? formatNumber(Math.floor(medalsAtCurrentWave.medal), 0) : "-";
            const medalWave = Number.isFinite(medalsAtCurrentWave?.wave) ? Math.floor(medalsAtCurrentWave.wave) : "-";
            const medalBuffMultiplier = 1 + (medalBuffPercent / 100);
            const currentMpm = Number.isFinite(medalMpmState?.currentMpm)
                ? formatNumber(medalMpmState.currentMpm * medalBuffMultiplier)
                : "-";
            const bestMpm = Number.isFinite(bestMpmState?.mpm)
                ? formatNumber(bestMpmState.mpm * medalBuffMultiplier)
                : "-";
            const bestMpmDetails = Number.isFinite(bestMpmState?.wave) && Number.isFinite(bestMpmState?.minute)
                ? ` (W${Math.floor(bestMpmState.wave)} at ${Math.floor(bestMpmState.minute)}m)`
                : "";
            const projectedMpm = Number.isFinite(medalMpmState?.projectedMpm)
                ? formatNumber(medalMpmState.projectedMpm * medalBuffMultiplier)
                : "-";
            const useBestMpmReference = Number.isFinite(bestMpmState?.mpm)
                && Number.isFinite(medalMpmState?.currentMpm)
                && bestMpmState.mpm > medalMpmState.currentMpm;
            const projectedGainReferenceMpm = useBestMpmReference
                ? bestMpmState.mpm
                : medalMpmState?.currentMpm;
            const projectedGainLabel = useBestMpmReference
                ? "Projected gain vs best"
                : "Projected gain";
            const projectedGain = Number.isFinite(projectedGainReferenceMpm)
                && projectedGainReferenceMpm > 0
                && Number.isFinite(medalMpmState?.projectedMpm)
                ? ((medalMpmState.projectedMpm / projectedGainReferenceMpm) - 1) * 100
                : NaN;
            const projectedGainValue = Number.isFinite(projectedGain)
                ? `${projectedGain >= 0 ? "+" : ""}${projectedGain.toFixed(2)}%`
                : "-";
            const projectedGainClass = Number.isFinite(projectedGain)
                ? projectedGain >= 1
                    ? "ef-wave-decision-continue"
                    : "ef-wave-decision-rebirth"
                : "";
            const targetWave = Number.isFinite(medalMpmState?.targetWave)
                ? Math.floor(medalMpmState.targetWave)
                : "-";
            const eta = Number.isFinite(medalMpmState?.etaSec)
                ? formatMinSec(medalMpmState.etaSec)
                : "-";
            const recommendation = medalMpmState?.recommendation || "warming up";
            const recommendationValue = recommendation === "continue_to_20m"
                ? "Continue to 20m"
                : recommendation === "continue"
                    ? "Continue"
                    : recommendation === "rebirth"
                        ? "Rebirth"
                        : recommendation;
            const recommendationClass = recommendation === "continue_to_20m" || recommendation === "continue"
                ? "ef-wave-decision-continue"
                : recommendation === "rebirth"
                    ? "ef-wave-decision-rebirth"
                    : "";
            setStatsVisible(true);
            setStatusVisible(false);
            renderMetrics([
                { label: "Current Wave", value: `${safeWave}` },
                { label: "Max Wave", value: `${safeMaxWave}` },
                { label: "WPM", value: safeWpm },
                { label: "Rebirth time", value: safeRebirthTime },
                { label: "Wave time", value: `${safeWaveTime}s` },
                { label: waveSpan10Label, value: `${safeWaveSpan10Total}s` },
                { label: "Wave average (10w)", value: `${safeWaveAvg10}s` },
                { label: "Wave average (100w)", value: `${safeWaveAvg100}s` },
                { label: "Completed Waves", value: `${safeCompletedWaves}` },
                { label: "Skipped Waves", value: `${safeSkippedWaves}` }
            ]);
            renderMedalsMetrics([
                { label: "Medals at current Wave", value: `${medalValue} (W${medalWave})` },
                { label: "Current MPM", value: currentMpm },
                { label: "Best MPM", value: `${bestMpm}${bestMpmDetails}` },
                { label: "Projected MPM", value: `${projectedMpm} (W${targetWave})` },
                { label: projectedGainLabel, value: projectedGainValue, valueClass: projectedGainClass },
                { label: "Target ETA", value: eta },
                { label: "Decision", value: recommendationValue, valueClass: recommendationClass }
            ]);
            syncMinimizedState();
        },
        setError(message) {
            setStatsVisible(false);
            setStatusVisible(true);
            renderStatus("Status", message);
            syncMinimizedState();
        },
        remove() {
            node.remove();
        }
    };
}
