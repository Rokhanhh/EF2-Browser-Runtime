export function createWaveMetrics(windowMs = 180000, minSpanMs = 15000, minDeltaWave = 2, minWaveEvents = 3) {
    const waveChanges = [];
    let lastWave = null;

    function trim(now) {
        while (waveChanges.length > 1 && now - waveChanges[0].at > windowMs) {
            waveChanges.shift();
        }
    }

    function addSample(wave, at = performance.now()) {
        if (!Number.isFinite(wave) || !Number.isFinite(at)) {
            return;
        }

        if (lastWave === null) {
            lastWave = wave;
            return;
        }

        if (wave < lastWave) {
            waveChanges.length = 0;
            lastWave = wave;
            return;
        }

        if (wave > lastWave) {
            waveChanges.push({ wave, at });
            trim(at);
        }

        lastWave = wave;
    }

    function getWpmState(now = performance.now()) {
        trim(now);
        if (waveChanges.length < minWaveEvents) {
            return { ready: false, wpm: 0 };
        }
        const first = waveChanges[0];
        const last = waveChanges[waveChanges.length - 1];
        const deltaWave = last.wave - first.wave;
        const deltaMs = last.at - first.at;
        if (deltaWave <= 0 || deltaMs <= 0) {
            return { ready: false, wpm: 0 };
        }
        if (deltaMs < minSpanMs || deltaWave < minDeltaWave) {
            return { ready: false, wpm: 0 };
        }
        return { ready: true, wpm: deltaWave / (deltaMs / 60000) };
    }

    function reset() {
        waveChanges.length = 0;
        lastWave = null;
    }

    return { addSample, getWpmState, reset };
}
