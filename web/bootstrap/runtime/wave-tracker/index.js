import { installWaveCandidateDetector } from "./detector.js";
import { createWaveMetrics } from "./metrics.js";
import { createWaveOverlay } from "./overlay.js";

const WRAPPED_MARKER = "__efWaveCheckProgressWrapped";
const MIN_VALID_WAVE_MS = 70;
const MIN_SOUL_REST_RUN_SEC = 20 * 60;
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
    waveAvg10Sec,
    waveAvg100Sec,
    waveAvgTimeSec,
    wpm,
    wpmReady,
    medalsAtCurrentWave
}) {
    const currentMedal = Number(medalsAtCurrentWave?.medal);
    const currentMinutes = rebirthTimeSec / 60;
    const currentMpm = Number.isFinite(currentMedal) && currentMedal > 0 && currentMinutes > 0
        ? currentMedal / currentMinutes
        : NaN;

    let estimatedWaveTimeSec = NaN;
    const waveTimeCandidates = [waveAvg10Sec, waveAvg100Sec, waveAvgTimeSec]
        .filter((value) => Number.isFinite(value) && value > 0);
    if (waveTimeCandidates.length > 0) {
        estimatedWaveTimeSec = Math.max(...waveTimeCandidates);
    } else if (wpmReady && Number.isFinite(wpm) && wpm > 0) {
        estimatedWaveTimeSec = 60 / wpm;
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

    const projectionLimitWave = Number.isFinite(maxWave) && maxWave > wave ? maxWave : Infinity;
    const entries = getRebirthMedalEntries();
    let bestProjectedMpm = currentMpm;
    let bestTargetWave = Number(medalsAtCurrentWave?.wave);
    let bestEtaSec = 0;

    for (const [targetWave, targetMedal] of entries) {
        if (targetWave <= wave || targetWave > projectionLimitWave || targetMedal <= currentMedal) {
            continue;
        }
        const etaSec = effectiveCurrentWaveTimeSec + Math.max(0, targetWave - wave - 1) * estimatedWaveTimeSec;
        const projectedMinutes = (rebirthTimeSec + etaSec) / 60;
        if (projectedMinutes <= 0) {
            continue;
        }
        const projectedMpm = targetMedal / projectedMinutes;
        if (projectedMpm > bestProjectedMpm) {
            bestProjectedMpm = projectedMpm;
            bestTargetWave = targetWave;
            bestEtaSec = etaSec;
        }
    }

    state.projectedMpm = bestProjectedMpm;
    state.targetWave = bestTargetWave;
    state.etaSec = bestEtaSec;
    state.recommendation = rebirthTimeSec < MIN_SOUL_REST_RUN_SEC
        ? "continue_to_20m"
        : bestProjectedMpm > currentMpm * 1.01 ? "continue" : "rebirth";
    return state;
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
    let validCompletedWaveCount = 0;
    let validCompletedWaveTotalMs = 0;
    const recentValidWaveDurationsMs = [];
    let uninstallJsonObserver = null;
    let rebirthStartedAt = performance.now();
    let completedWaves = 0;
    let skippedWaves = 0;

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
        validCompletedWaveCount = 0;
        validCompletedWaveTotalMs = 0;
        recentValidWaveDurationsMs.length = 0;
        rebirthStartedAt = now;
        completedWaves = 0;
        skippedWaves = 0;
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
                    if (durationMs >= MIN_VALID_WAVE_MS) {
                        validCompletedWaveCount += 1;
                        validCompletedWaveTotalMs += durationMs;
                        recentValidWaveDurationsMs.push(durationMs);
                        if (recentValidWaveDurationsMs.length > ROLLING_WAVE_WINDOW) {
                            recentValidWaveDurationsMs.shift();
                        }
                    }
                }
                trackedWave = wave;
                trackedWaveStartedAt = now;
                if (!hasWaveBaseline && Number.isFinite(wave) && wave > 0) {
                    hasWaveBaseline = true;
                }
            }

            const waveTimeSec = Math.max(0, (now - trackedWaveStartedAt) / 1000);
            const waveAvgTimeSec = validCompletedWaveCount > 0
                ? (validCompletedWaveTotalMs / validCompletedWaveCount) / 1000
                : NaN;
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

            metrics.addSample(wave);
            if (now - lastOverlayAt >= 50) {
                lastOverlayAt = now;
                const wpmState = metrics.getWpmState(now);
                const medalMpmState = createMedalMpmState({
                    wave,
                    maxWave,
                    rebirthTimeSec,
                    waveTimeSec,
                    waveAvg10Sec,
                    waveAvg100Sec,
                    waveAvgTimeSec,
                    medalsAtCurrentWave,
                    wpm: wpmState.wpm,
                    wpmReady: wpmState.ready
                });
                overlay.setBattle({
                    wave,
                    maxWave,
                    rebirthTimeSec,
                    waveTimeSec,
                    waveAvgTimeSec,
                    waveAvg10Sec,
                    waveAvg100Sec,
                    completedWaves,
                    skippedWaves,
                    medalsAtCurrentWave,
                    medalMpmState,
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
            waveAvg100Sec: NaN,
            waveAvg10Sec: NaN,
            waveAvgTimeSec: NaN,
            medalsAtCurrentWave,
            wpm: 0,
            wpmReady: false
        });
        metrics.addSample(initialDisplayWave);
        overlay.setBattle({
            wave: initialDisplayWave,
            maxWave,
            rebirthTimeSec: initialRebirthTimeSec,
            waveTimeSec: 0,
            waveAvgTimeSec: 0,
            waveAvg10Sec: NaN,
            waveAvg100Sec: NaN,
            completedWaves: 0,
            skippedWaves: 0,
            medalsAtCurrentWave,
            medalMpmState: initialMedalMpmState,
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
