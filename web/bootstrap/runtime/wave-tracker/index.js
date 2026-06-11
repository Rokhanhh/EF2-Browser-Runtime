import { installWaveCandidateDetector } from "./detector.js";
import { createWaveMetrics } from "./metrics.js";
import { createWaveOverlay } from "./overlay.js";

const WRAPPED_MARKER = "__efWaveCheckProgressWrapped";
const MIN_VALID_WAVE_MS = 70;
const MIN_SOUL_REST_RUN_SEC = 20 * 60;
const PROJECTED_GAIN_REQUIRED_RATIO = 1.01;
const PROJECTION_WAVE_HORIZON = 500;
const ROLLING_SHORT_WAVE_WINDOW = 10;
const ROLLING_WAVE_WINDOW = 100;
const REBIRTH_TIER_STORAGE_KEY = "__EF_HERO_REBIRTH_MEDAL_TIER_CACHE__";

function parseTimeMs(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value > 0 && value < 100000000000 ? value * 1000 : value;
    }
    if (typeof value === "string" && value.trim()) {
        const parsed = new Date(value).getTime();
        return Number.isFinite(parsed) ? parsed : NaN;
    }
    return NaN;
}

function isValidController(candidate) {
    if (!candidate || typeof candidate !== "object") {
        return false;
    }
    const hasSignature = typeof candidate.getCurrentWave === "function"
        && typeof candidate.getWaveTime === "function"
        && typeof candidate.checkProgress === "function";
    if (!hasSignature) {
        return false;
    }

    if (!Object.prototype.hasOwnProperty.call(candidate, "currentWave")
        || !Object.prototype.hasOwnProperty.call(candidate, "waveStartTime")) {
        return false;
    }

    try {
        const wave = Number(candidate.getCurrentWave());
        const waveTime = Number(candidate.getWaveTime());
        return Number.isFinite(wave) && Number.isFinite(waveTime);
    } catch (error) {
        return false;
    }
}

function getRebirthTierStore() {
    if (!window.__EF_HERO_REBIRTH_MEDAL_TIER__) {
        try {
            const raw = window.localStorage.getItem(REBIRTH_TIER_STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === "object" && parsed.byVersion && typeof parsed.byVersion === "object") {
                    window.__EF_BATCH_WAVE_MEDALS__ = parsed;
                    const latestVersion = parsed.latestVersion || Object.keys(parsed.byVersion)[0];
                    if (latestVersion && parsed.byVersion[latestVersion]) {
                        window.__EF_HERO_REBIRTH_MEDAL_TIER__ = parsed.byVersion[latestVersion];
                    }
                }
            }
        } catch (error) {
            // Ignore restore errors.
        }
    }

    const direct = window.__EF_HERO_REBIRTH_MEDAL_TIER__;
    if (direct && typeof direct === "object") {
        return direct;
    }

    const batch = window.__EF_BATCH_WAVE_MEDALS__;
    if (batch && batch.byVersion && typeof batch.byVersion === "object") {
        const latestVersion = batch.latestVersion;
        if (latestVersion && batch.byVersion[latestVersion]) {
            return batch.byVersion[latestVersion];
        }

        const versions = Object.keys(batch.byVersion);
        for (let i = versions.length - 1; i >= 0; i -= 1) {
            const candidate = batch.byVersion[versions[i]];
            if (!candidate || typeof candidate !== "object") {
                continue;
            }
            const hasMap = candidate.waveToMedal && typeof candidate.waveToMedal === "object"
                && Object.keys(candidate.waveToMedal).length > 0;
            const hasEntries = Array.isArray(candidate.entries) && candidate.entries.length > 0;
            if (hasMap || hasEntries) {
                return candidate;
            }
        }
    }

    return null;
}

function getMedalsAtCurrentWave(wave) {
    if (!Number.isFinite(wave) || wave <= 0) {
        return { wave: NaN, medal: NaN };
    }

    const store = getRebirthTierStore();
    if (!store || typeof store !== "object") {
        return { wave: NaN, medal: NaN };
    }

    const targetWave = Math.max(10, Math.floor(wave / 10) * 10);
    const waveToMedal = store.waveToMedal && typeof store.waveToMedal === "object"
        ? store.waveToMedal
        : null;
    if (waveToMedal) {
        const directMedal = Number(waveToMedal[targetWave]);
        if (Number.isFinite(directMedal)) {
            return { wave: targetWave, medal: directMedal };
        }
    }

    if (Array.isArray(store.entries)) {
        const next = store.entries.find((entry) => Array.isArray(entry) && Number(entry[0]) >= targetWave);
        if (next) {
            const nextWave = Number(next[0]);
            const nextMedal = Number(next[1]);
            if (Number.isFinite(nextWave) && Number.isFinite(nextMedal)) {
                return { wave: nextWave, medal: nextMedal };
            }
        }
    }

    return { wave: targetWave, medal: NaN };
}

function getRebirthMedalEntries() {
    const store = getRebirthTierStore();
    if (!store || typeof store !== "object") {
        return [];
    }

    if (Array.isArray(store.entries) && store.entries.length > 0) {
        return store.entries
            .map((entry) => [Number(entry?.[0]), Number(entry?.[1])])
            .filter(([wave, medal]) => Number.isFinite(wave) && Number.isFinite(medal))
            .sort((a, b) => a[0] - b[0]);
    }

    const waveToMedal = store.waveToMedal && typeof store.waveToMedal === "object"
        ? store.waveToMedal
        : null;
    if (!waveToMedal) {
        return [];
    }

    return Object.entries(waveToMedal)
        .map(([wave, medal]) => [Number(wave), Number(medal)])
        .filter(([wave, medal]) => Number.isFinite(wave) && Number.isFinite(medal))
        .sort((a, b) => a[0] - b[0]);
}

function createMedalMpmState({
    wave,
    maxWave,
    rebirthTimeSec,
    waveTimeSec,
    blockEstimatedWaveTimeSec,
    waveAvg10Sec,
    waveAvg100Sec,
    wpm,
    wpmReady,
    medalsAtCurrentWave,
    bestMpm
}) {
    const currentMedal = Number(medalsAtCurrentWave?.medal);
    const calculateGameMpm = (medal, elapsedSec) => {
        const elapsedMinutes = Number.isFinite(elapsedSec)
            ? Math.max(MIN_SOUL_REST_RUN_SEC / 60, Math.floor(elapsedSec / 60))
            : NaN;
        return Number.isFinite(medal) && medal > 0 && Number.isFinite(elapsedMinutes)
            ? medal / elapsedMinutes
            : NaN;
    };
    const currentMpm = calculateGameMpm(currentMedal, rebirthTimeSec);

    let estimatedWaveTimeSec = NaN;
    if (Number.isFinite(blockEstimatedWaveTimeSec) && blockEstimatedWaveTimeSec > 0) {
        estimatedWaveTimeSec = blockEstimatedWaveTimeSec;
    } else if (wpmReady && Number.isFinite(wpm) && wpm > 0) {
        const waveTimeCandidates = [waveAvg10Sec, waveAvg100Sec, 60 / wpm]
            .filter((value) => Number.isFinite(value) && value > 0);
        if (waveTimeCandidates.length > 0) {
            estimatedWaveTimeSec = Math.max(...waveTimeCandidates);
        }
    } else {
        const waveTimeCandidates = [waveAvg10Sec, waveAvg100Sec]
            .filter((value) => Number.isFinite(value) && value > 0);
        if (waveTimeCandidates.length > 0) {
            estimatedWaveTimeSec = Math.max(...waveTimeCandidates);
        }
    }

    const state = {
        currentMpm,
        projectedMpm: NaN,
        targetWave: NaN,
        etaSec: NaN,
        recommendation: rebirthTimeSec < MIN_SOUL_REST_RUN_SEC ? "continue_to_20m" : "warming up"
    };

    if (!Number.isFinite(wave) || !Number.isFinite(currentMpm) || currentMpm <= 0) {
        return state;
    }

    if (!Number.isFinite(estimatedWaveTimeSec) || estimatedWaveTimeSec <= 0) {
        state.recommendation = rebirthTimeSec < MIN_SOUL_REST_RUN_SEC ? "continue_to_20m" : "need speed";
        return state;
    }
    const currentWaveElapsedSec = Number.isFinite(waveTimeSec) && waveTimeSec > 0 ? waveTimeSec : 0;
    const effectiveCurrentWaveTimeSec = Math.max(estimatedWaveTimeSec, currentWaveElapsedSec);

    const localProjectionLimitWave = wave + PROJECTION_WAVE_HORIZON;
    const projectionLimitWave = Number.isFinite(maxWave) && maxWave > wave
        ? Math.min(maxWave, localProjectionLimitWave)
        : localProjectionLimitWave;
    const entries = getRebirthMedalEntries();
    let bestProjectedMpm = currentMpm;
    let bestTargetWave = Number(medalsAtCurrentWave?.wave);
    let bestEtaSec = 0;

    for (const [targetWave, targetMedal] of entries) {
        if (targetWave <= wave || targetWave > projectionLimitWave || targetMedal <= currentMedal) {
            continue;
        }
        const etaSec = effectiveCurrentWaveTimeSec + Math.max(0, targetWave - wave - 1) * estimatedWaveTimeSec;
        const projectedMpm = calculateGameMpm(targetMedal, rebirthTimeSec + etaSec);
        if (!Number.isFinite(projectedMpm) || projectedMpm <= 0) {
            continue;
        }
        if (projectedMpm > bestProjectedMpm) {
            bestProjectedMpm = projectedMpm;
            bestTargetWave = targetWave;
            bestEtaSec = etaSec;
        }
    }

    state.projectedMpm = bestProjectedMpm;
    state.targetWave = bestTargetWave;
    state.etaSec = bestEtaSec;
    const decisionReferenceMpm = Number.isFinite(bestMpm)
        ? Math.max(currentMpm, bestMpm)
        : currentMpm;
    state.recommendation = rebirthTimeSec < MIN_SOUL_REST_RUN_SEC
        ? "continue_to_20m"
        : bestProjectedMpm > decisionReferenceMpm * PROJECTED_GAIN_REQUIRED_RATIO ? "continue" : "rebirth";
    return state;
}

function getGameMpmMinute(rebirthTimeSec) {
    return Number.isFinite(rebirthTimeSec)
        ? Math.max(MIN_SOUL_REST_RUN_SEC / 60, Math.floor(rebirthTimeSec / 60))
        : NaN;
}

export function attachWaveTracker({ scanWarnMs = 15000, scanHardTimeoutMs = null } = {}) {
    const overlay = createWaveOverlay();
    const metrics = createWaveMetrics();

    let stopDetector = null;
    let detachControllerHook = null;
    let warnTimeoutId = null;
    let hardTimeoutId = null;
    let attached = true;
    let lastOverlayAt = 0;
    let trackedWave = null;
    let hasWaveBaseline = false;
    let trackedWaveStartedAt = performance.now();
    let maxWave = NaN;
    let profileWave = NaN;
    let profileLastReviveTimeMs = NaN;
    let hasProfileLastReviveBaseline = false;
    const recentValidWaveDurationsMs = [];
    let uninstallJsonObserver = null;
    let rebirthStartedAt = performance.now();
    let completedWaves = 0;
    let skippedWaves = 0;
    let bestMpmState = {
        mpm: NaN,
        wave: NaN,
        minute: NaN
    };

    const startAt = performance.now();
    window.__EF_WAVE_TRACKER_STATE__ = {
        status: "scanning",
        hookedAtMs: null
    };

    function safeCleanupDetector() {
        if (!stopDetector) {
            return;
        }
        const stop = stopDetector;
        stopDetector = null;
        stop();
    }

    function resetSessionStats(now, nextWave) {
        metrics.reset();
        trackedWave = Number.isFinite(nextWave) ? nextWave : null;
        hasWaveBaseline = Number.isFinite(nextWave) && nextWave > 0;
        trackedWaveStartedAt = now;
        recentValidWaveDurationsMs.length = 0;
        rebirthStartedAt = now;
        completedWaves = 0;
        skippedWaves = 0;
        bestMpmState = {
            mpm: NaN,
            wave: NaN,
            minute: NaN
        };
    }

    function addEffectiveWaveDurationSamples(durationMs, deltaWave) {
        if (!Number.isFinite(durationMs) || durationMs < MIN_VALID_WAVE_MS || !Number.isFinite(deltaWave) || deltaWave <= 0) {
            return;
        }

        const advancedWaves = Math.max(1, Math.floor(deltaWave));
        const waveDurationMs = durationMs / advancedWaves;
        const samplesToAdd = Math.min(advancedWaves, ROLLING_WAVE_WINDOW);
        for (let i = 0; i < samplesToAdd; i += 1) {
            recentValidWaveDurationsMs.push(waveDurationMs);
        }

        while (recentValidWaveDurationsMs.length > ROLLING_WAVE_WINDOW) {
            recentValidWaveDurationsMs.shift();
        }
    }

    function updateBestMpmState(medalMpmState, medalsAtCurrentWave, wave, rebirthTimeSec) {
        const currentMpm = Number(medalMpmState?.currentMpm);
        if (!Number.isFinite(currentMpm) || currentMpm <= 0) {
            return;
        }

        if (Number.isFinite(bestMpmState.mpm) && currentMpm <= bestMpmState.mpm) {
            return;
        }

        bestMpmState = {
            mpm: currentMpm,
            wave: Number.isFinite(medalsAtCurrentWave?.wave) ? Math.floor(medalsAtCurrentWave.wave) : Math.floor(wave),
            minute: getGameMpmMinute(rebirthTimeSec)
        };
    }

    function updateProfileLastReviveTime(value) {
        const parsedLastReviveTimeMs = parseTimeMs(value);
        if (!Number.isFinite(parsedLastReviveTimeMs) || parsedLastReviveTimeMs <= 0) {
            return;
        }

        if (!hasProfileLastReviveBaseline) {
            profileLastReviveTimeMs = parsedLastReviveTimeMs;
            hasProfileLastReviveBaseline = true;
            return;
        }

        if (parsedLastReviveTimeMs > profileLastReviveTimeMs + 5000) {
            profileLastReviveTimeMs = parsedLastReviveTimeMs;
            resetSessionStats(performance.now(), profileWave);
            return;
        }

        if (parsedLastReviveTimeMs > profileLastReviveTimeMs) {
            profileLastReviveTimeMs = parsedLastReviveTimeMs;
        }
    }

    function installJsonProfileObserver() {
        const nativeParse = JSON.parse;

        JSON.parse = function patchedParse(text, reviver) {
            const parsed = nativeParse(text, reviver);
            try {
                const user = parsed && parsed.body && parsed.body.user;
                if (user && typeof user === "object") {
                    const parsedMaxWave = Number(user.maxWave);
                    if (Number.isFinite(parsedMaxWave)) {
                        maxWave = parsedMaxWave;
                    }
                    const parsedWave = Number(user.wave);
                    if (Number.isFinite(parsedWave)) {
                        profileWave = parsedWave;
                    }
                    updateProfileLastReviveTime(user.lastReviveTime);
                }
            } catch (error) {
                // Keep parser stable.
            }
            return parsed;
        };

        return () => {
            JSON.parse = nativeParse;
        };
    }

    function hookController(controller) {
        if (!attached || !isValidController(controller)) {
            return;
        }

        const original = controller.checkProgress;
        if (typeof original !== "function" || original[WRAPPED_MARKER]) {
            return;
        }

        const wrapped = function wrappedCheckProgress(...args) {
            const result = original.apply(this, args);
            const wave = Number(this.getCurrentWave());
            const now = performance.now();

            if (trackedWave === null || wave !== trackedWave) {
                if (trackedWave !== null && Number.isFinite(trackedWave) && hasWaveBaseline) {
                    const deltaWave = wave - trackedWave;
                    completedWaves += 1;
                    if (deltaWave > 1) {
                        skippedWaves += (deltaWave - 1);
                    }
                    const durationMs = Math.max(0, now - trackedWaveStartedAt);
                    addEffectiveWaveDurationSamples(durationMs, deltaWave);
                }
                trackedWave = wave;
                trackedWaveStartedAt = now;
                if (!hasWaveBaseline && Number.isFinite(wave) && wave > 0) {
                    hasWaveBaseline = true;
                }
            }

            const waveTimeSec = Math.max(0, (now - trackedWaveStartedAt) / 1000);
            const waveAvg10Sec = recentValidWaveDurationsMs.length > 0
                ? (() => {
                    const values = recentValidWaveDurationsMs.slice(-ROLLING_SHORT_WAVE_WINDOW);
                    return (values.reduce((acc, value) => acc + value, 0) / values.length) / 1000;
                })()
                : NaN;
            const waveAvg100Sec = recentValidWaveDurationsMs.length > 0
                ? (recentValidWaveDurationsMs.reduce((acc, value) => acc + value, 0) / recentValidWaveDurationsMs.length) / 1000
                : NaN;
            const nowWallMs = Date.now();
            const profileRebirthTimeSec = Number.isFinite(profileLastReviveTimeMs)
                ? Math.max(0, (nowWallMs - profileLastReviveTimeMs) / 1000)
                : NaN;
            const rebirthTimeSec = Number.isFinite(profileRebirthTimeSec)
                ? profileRebirthTimeSec
                : Math.max(0, (now - rebirthStartedAt) / 1000);
            const medalsAtCurrentWave = getMedalsAtCurrentWave(wave);

            metrics.addSample(wave, now);
            if (now - lastOverlayAt >= 50) {
                lastOverlayAt = now;
                const wpmState = metrics.getWpmState(now);
                const waveSpan10State = metrics.getWaveSpanTimeState(10, now);
                const waveBlockEstimateState = metrics.getWaveBlockEstimateState(10, now);
                const medalMpmState = createMedalMpmState({
                    wave,
                    maxWave,
                    rebirthTimeSec,
                    waveTimeSec,
                    blockEstimatedWaveTimeSec: waveBlockEstimateState.estimatedWaveTimeSec,
                    waveAvg10Sec,
                    waveAvg100Sec,
                    medalsAtCurrentWave,
                    bestMpm: bestMpmState.mpm,
                    wpm: wpmState.wpm,
                    wpmReady: wpmState.ready
                });
                updateBestMpmState(medalMpmState, medalsAtCurrentWave, wave, rebirthTimeSec);
                overlay.setBattle({
                    wave,
                    maxWave,
                    rebirthTimeSec,
                    waveTimeSec,
                    waveSpan10TotalSec: waveSpan10State.totalTimeSec,
                    waveSpan10FromWave: waveSpan10State.fromWave,
                    waveSpan10ToWave: waveSpan10State.toWave,
                    waveAvg10Sec,
                    waveAvg100Sec,
                    completedWaves,
                    skippedWaves,
                    medalsAtCurrentWave,
                    medalMpmState,
                    bestMpmState,
                    wpm: wpmState.wpm,
                    wpmReady: wpmState.ready
                });
            }

            return result;
        };

        wrapped[WRAPPED_MARKER] = true;
        controller.checkProgress = wrapped;

        const initialWave = Number(controller.getCurrentWave());
        trackedWave = Number.isFinite(initialWave) ? initialWave : null;
        hasWaveBaseline = Number.isFinite(initialWave) && initialWave > 0;
        trackedWaveStartedAt = performance.now();
        rebirthStartedAt = trackedWaveStartedAt;

        const initialDisplayWave = Number.isFinite(initialWave) ? initialWave : profileWave;
        const medalsAtCurrentWave = getMedalsAtCurrentWave(initialDisplayWave);
        const initialRebirthTimeSec = Number.isFinite(profileLastReviveTimeMs)
            ? Math.max(0, (Date.now() - profileLastReviveTimeMs) / 1000)
            : 0;
        const initialMedalMpmState = createMedalMpmState({
            wave: initialDisplayWave,
            maxWave,
            rebirthTimeSec: initialRebirthTimeSec,
            waveTimeSec: 0,
            blockEstimatedWaveTimeSec: NaN,
            waveAvg100Sec: NaN,
            waveAvg10Sec: NaN,
            medalsAtCurrentWave,
            bestMpm: bestMpmState.mpm,
            wpm: 0,
            wpmReady: false
        });
        updateBestMpmState(initialMedalMpmState, medalsAtCurrentWave, initialDisplayWave, initialRebirthTimeSec);
        metrics.addSample(initialDisplayWave);
        overlay.setBattle({
            wave: initialDisplayWave,
            maxWave,
            rebirthTimeSec: initialRebirthTimeSec,
            waveTimeSec: 0,
            waveSpan10TotalSec: NaN,
            waveSpan10FromWave: NaN,
            waveSpan10ToWave: NaN,
            waveAvg10Sec: NaN,
            waveAvg100Sec: NaN,
            completedWaves: 0,
            skippedWaves: 0,
            medalsAtCurrentWave,
            medalMpmState: initialMedalMpmState,
            bestMpmState,
            wpm: 0,
            wpmReady: false
        });

        window.__EF_WAVE_TRACKER_STATE__.status = "hooked";
        window.__EF_WAVE_TRACKER_STATE__.hookedAtMs = Math.round(performance.now() - startAt);

        detachControllerHook = () => {
            if (controller.checkProgress === wrapped) {
                controller.checkProgress = original;
            }
        };

        safeCleanupDetector();

        if (warnTimeoutId !== null) {
            window.clearTimeout(warnTimeoutId);
            warnTimeoutId = null;
        }
        if (hardTimeoutId !== null) {
            window.clearTimeout(hardTimeoutId);
            hardTimeoutId = null;
        }
    }

    overlay.setScanning();
    try {
        stopDetector = installWaveCandidateDetector(hookController);
    } catch (error) {
        overlay.setError("detector install failed");
        return { detach() {} };
    }

    uninstallJsonObserver = installJsonProfileObserver();

    warnTimeoutId = window.setTimeout(() => {
        if (!attached || !stopDetector) {
            return;
        }
        overlay.setError("scan slow (waiting)");
        window.__EF_WAVE_TRACKER_STATE__.status = "slow";
    }, scanWarnMs);

    if (Number.isFinite(scanHardTimeoutMs) && scanHardTimeoutMs > 0) {
        hardTimeoutId = window.setTimeout(() => {
            safeCleanupDetector();
            overlay.setError("scan timeout");
            window.__EF_WAVE_TRACKER_STATE__.status = "timeout";
        }, scanHardTimeoutMs);
    }

    return {
        detach() {
            if (!attached) {
                return;
            }
            attached = false;

            if (warnTimeoutId !== null) {
                window.clearTimeout(warnTimeoutId);
                warnTimeoutId = null;
            }
            if (hardTimeoutId !== null) {
                window.clearTimeout(hardTimeoutId);
                hardTimeoutId = null;
            }
            if (typeof uninstallJsonObserver === "function") {
                uninstallJsonObserver();
                uninstallJsonObserver = null;
            }

            safeCleanupDetector();

            if (detachControllerHook) {
                detachControllerHook();
                detachControllerHook = null;
            }

            overlay.remove();
            window.__EF_WAVE_TRACKER_STATE__.status = "detached";
        }
    };
}
