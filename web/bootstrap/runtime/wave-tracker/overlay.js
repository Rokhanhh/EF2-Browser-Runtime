const OVERLAY_ID = "ef-wave-overlay";
const MEDAL_BUFF_STORAGE_KEY = "__EF_WAVE_TRACKER_MEDAL_BUFF_PERCENT__";

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
  min-width: 220px;
  padding: 9px 11px;
  border-radius: 8px;
  border: 1px solid rgba(255, 224, 138, 0.35);
  background: rgba(0, 0, 0, 0.72);
  color: #ffe08a;
  font-family: monospace;
  font-size: 14px;
  line-height: 1.25;
  pointer-events: none;
}
#${OVERLAY_ID} .ef-wave-title {
  font-weight: 700;
  font-size: 16px;
  letter-spacing: 0.3px;
  margin-bottom: 6px;
  text-align: center;
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

function formatNumber(value, digits = 2) {
    if (!Number.isFinite(value)) {
        return "-";
    }
    if (Math.abs(value) >= 1000000) {
        return value.toExponential(2);
    }
    return value.toLocaleString(undefined, {
        maximumFractionDigits: digits
    });
}

function readStoredMedalBuffPercent() {
    try {
        const parsed = Number.parseInt(window.localStorage.getItem(MEDAL_BUFF_STORAGE_KEY) || "", 10);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    } catch (error) {
        return 0;
    }
}

export function createWaveOverlay() {
    ensureStyle();
    const node = document.createElement("div");
    node.id = OVERLAY_ID;
    node.innerHTML = `
<div class="ef-wave-title">Wave Tracker</div>
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
`;
    const topSeparator = node.querySelector(".ef-wave-separator");
    const status = node.querySelector(".ef-wave-status");
    const body = node.querySelector(".ef-wave-body");
    const bottomSeparator = node.querySelector(".ef-wave-separator.bottom");
    const medalsSubtitle = node.querySelector(".ef-wave-subtitle");
    const medalsSeparator = node.querySelector(".ef-wave-separator.medals");
    const medalsBody = node.querySelector(".ef-wave-medals-body");
    const medalBuffControl = node.querySelector(".ef-wave-medal-buff");
    const medalBuffInput = node.querySelector(".ef-wave-medal-buff-input");
    const medalBuffButton = node.querySelector(".ef-wave-medal-buff-button");
    let medalBuffPercent = readStoredMedalBuffPercent();
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

    function renderMetrics(metrics) {
        body.innerHTML = metrics.map(({ label, value }) => (
            `<div class="ef-wave-metric"><div class="ef-wave-label">${label}</div><div class="ef-wave-value">${value}</div></div>`
        )).join("");
    }

    function renderStatus(label, value) {
        status.innerHTML = label
            ? `<span class="ef-wave-label">${label}:</span><span class="ef-wave-value">${value}</span>`
            : "";
    }

    function renderMedalsMetrics(metrics) {
        medalsBody.innerHTML = metrics.map(({ label, value, valueClass = "" }) => (
            `<div class="ef-wave-metric"><div class="ef-wave-label">${label}</div><div class="ef-wave-value ${valueClass}">${value}</div></div>`
        )).join("");
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

    return {
        setScanning() {
            setStatsVisible(false);
            setStatusVisible(true);
            renderStatus("Status", "scanning");
        },
        setBattle({
            wave,
            maxWave,
            rebirthTimeSec,
            wpm,
            wpmReady,
            waveTimeSec,
            waveAvgTimeSec,
            waveAvg10Sec,
            waveAvg100Sec,
            completedWaves,
            skippedWaves,
            medalsAtCurrentWave,
            medalMpmState
        }) {
            const safeWave = Number.isFinite(wave) ? Math.floor(wave) : "-";
            const safeMaxWave = Number.isFinite(maxWave) ? Math.floor(maxWave) : "syncing";
            const safeRebirthTime = Number.isFinite(rebirthTimeSec)
                ? new Date(Math.floor(rebirthTimeSec) * 1000).toISOString().slice(11, 19)
                : "00:00:00";
            const safeWaveTime = Number.isFinite(waveTimeSec) ? waveTimeSec.toFixed(2) : "-";
            const safeWaveAvg = Number.isFinite(waveAvgTimeSec) ? waveAvgTimeSec.toFixed(2) : "0.00";
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
            const projectedMpm = Number.isFinite(medalMpmState?.projectedMpm)
                ? formatNumber(medalMpmState.projectedMpm * medalBuffMultiplier)
                : "-";
            const projectedGain = Number.isFinite(medalMpmState?.currentMpm)
                && medalMpmState.currentMpm > 0
                && Number.isFinite(medalMpmState?.projectedMpm)
                ? ((medalMpmState.projectedMpm / medalMpmState.currentMpm) - 1) * 100
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
                ? new Date(Math.floor(medalMpmState.etaSec) * 1000).toISOString().slice(11, 19)
                : "-";
            const recommendation = medalMpmState?.recommendation || "warming up";
            const recommendationValue = recommendation === "continue"
                ? "Continue"
                : recommendation === "rebirth"
                    ? "Rebirth"
                    : recommendation;
            const recommendationClass = recommendation === "continue"
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
                { label: "Wave average time", value: `${safeWaveAvg}s` },
                { label: "Wave average (10w)", value: `${safeWaveAvg10}s` },
                { label: "Wave average (100w)", value: `${safeWaveAvg100}s` },
                { label: "Completed Waves", value: `${safeCompletedWaves}` },
                { label: "Skipped Waves", value: `${safeSkippedWaves}` }
            ]);
            renderMedalsMetrics([
                { label: "Medals at current Wave", value: `${medalValue} (W${medalWave})` },
                { label: "Current MPM", value: currentMpm },
                { label: "Projected MPM", value: `${projectedMpm} (W${targetWave})` },
                { label: "Projected gain", value: projectedGainValue, valueClass: projectedGainClass },
                { label: "Target ETA", value: eta },
                { label: "Decision", value: recommendationValue, valueClass: recommendationClass }
            ]);
        },
        setError(message) {
            setStatsVisible(false);
            setStatusVisible(true);
            renderStatus("Status", message);
        },
        remove() {
            node.remove();
        }
    };
}
