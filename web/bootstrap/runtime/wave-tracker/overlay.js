const OVERLAY_ID = "ef-wave-overlay";

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
#${OVERLAY_ID} .ef-wave-hidden {
  display: none !important;
}
`;
    document.head.appendChild(style);
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
<div class="ef-wave-subtitle">Medals</div>
<div class="ef-wave-separator medals"></div>
<div class="ef-wave-medals-body"></div>
`;
    const topSeparator = node.querySelector(".ef-wave-separator");
    const status = node.querySelector(".ef-wave-status");
    const body = node.querySelector(".ef-wave-body");
    const bottomSeparator = node.querySelector(".ef-wave-separator.bottom");
    const medalsSubtitle = node.querySelector(".ef-wave-subtitle");
    const medalsSeparator = node.querySelector(".ef-wave-separator.medals");
    const medalsBody = node.querySelector(".ef-wave-medals-body");

    function setStatsVisible(visible) {
        const className = "ef-wave-hidden";
        for (const element of [topSeparator, body, bottomSeparator, medalsSubtitle, medalsSeparator, medalsBody]) {
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
        medalsBody.innerHTML = metrics.map(({ label, value }) => (
            `<div class="ef-wave-metric"><div class="ef-wave-label">${label}</div><div class="ef-wave-value">${value}</div></div>`
        )).join("");
    }

    function setStatusVisible(visible) {
        status.classList.toggle("ef-wave-hidden", !visible);
    }

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
            waveAvg100Sec,
            waveP95Sec,
            completedWaves,
            skippedWaves,
            medalsAtCurrentWave
        }) {
            const safeWave = Number.isFinite(wave) ? Math.floor(wave) : "-";
            const safeMaxWave = Number.isFinite(maxWave) ? Math.floor(maxWave) : "syncing";
            const safeRebirthTime = Number.isFinite(rebirthTimeSec)
                ? new Date(Math.floor(rebirthTimeSec) * 1000).toISOString().slice(11, 19)
                : "00:00:00";
            const safeWaveTime = Number.isFinite(waveTimeSec) ? waveTimeSec.toFixed(2) : "-";
            const safeWaveAvg = Number.isFinite(waveAvgTimeSec) ? waveAvgTimeSec.toFixed(2) : "0.00";
            const safeWaveAvg100 = Number.isFinite(waveAvg100Sec) ? waveAvg100Sec.toFixed(2) : "0.00";
            const safeWaveP95 = Number.isFinite(waveP95Sec) ? waveP95Sec.toFixed(2) : "0.00";
            const safeWpm = wpmReady && Number.isFinite(wpm) ? wpm.toFixed(2) : "warming up";
            const safeCompletedWaves = Number.isFinite(completedWaves) ? Math.floor(completedWaves) : 0;
            const safeSkippedWaves = Number.isFinite(skippedWaves) ? Math.floor(skippedWaves) : 0;
            const medalValue = Number.isFinite(medalsAtCurrentWave?.medal) ? Math.floor(medalsAtCurrentWave.medal) : "-";
            const medalWave = Number.isFinite(medalsAtCurrentWave?.wave) ? Math.floor(medalsAtCurrentWave.wave) : "-";
            setStatsVisible(true);
            setStatusVisible(false);
            renderMetrics([
                { label: "Wave", value: `${safeWave}` },
                { label: "Max Wave", value: `${safeMaxWave}` },
                { label: "WPM", value: safeWpm },
                { label: "Rebirth time", value: safeRebirthTime },
                { label: "Wave time", value: `${safeWaveTime}s` },
                { label: "Wave average time", value: `${safeWaveAvg}s` },
                { label: "Wave average (100w)", value: `${safeWaveAvg100}s` },
                { label: "P95 wave time (100w)", value: `${safeWaveP95}s` },
                { label: "Completed Waves", value: `${safeCompletedWaves}` },
                { label: "Skipped Waves", value: `${safeSkippedWaves}` }
            ]);
            renderMedalsMetrics([
                { label: "Medals at current Wave", value: `${medalValue} (W${medalWave})` }
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
