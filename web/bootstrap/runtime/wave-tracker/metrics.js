export function createWaveMetrics(windowMs = 180000, minSpanMs = 15000, minDeltaWave = 2, minWaveEvents = 3) {
    const waveChanges = [];
    const waveSamples = [];
    const waveBoundaries = [];
    let lastWave = null;

    function trim(now) {
        while (waveChanges.length > 1 && now - waveChanges[0].at > windowMs) {
            waveChanges.shift();
        }
        while (waveSamples.length > 1 && now - waveSamples[0].at > windowMs) {
            waveSamples.shift();
        }
        while (waveBoundaries.length > 1 && now - waveBoundaries[0].at > windowMs) {
            waveBoundaries.shift();
        }
    }

    function addBoundary(wave, at) {
        if (!Number.isFinite(wave) || wave <= 0) {
            return;
        }
        const lastBoundary = waveBoundaries[waveBoundaries.length - 1];
        if (lastBoundary && lastBoundary.wave === wave) {
            return;
        }
        waveBoundaries.push({ wave, at });
    }

    function addCrossedBoundaries(fromWave, toWave, at, spanWaves) {
        const firstBoundary = Math.ceil((fromWave + 1) / spanWaves) * spanWaves;
        for (let boundary = firstBoundary; boundary <= toWave; boundary += spanWaves) {
            addBoundary(boundary, at);
        }
    }

    function addSample(wave, at = performance.now()) {
        if (!Number.isFinite(wave) || !Number.isFinite(at)) {
            return;
        }

        if (lastWave === null) {
            lastWave = wave;
            waveSamples.push({ wave, at });
            if (wave > 0 && wave % 10 === 0) {
                addBoundary(wave, at);
            }
            trim(at);
            return;
        }

        if (wave < lastWave) {
            waveChanges.length = 0;
            waveSamples.length = 0;
            waveBoundaries.length = 0;
            waveSamples.push({ wave, at });
            if (wave > 0 && wave % 10 === 0) {
                addBoundary(wave, at);
            }
            lastWave = wave;
            trim(at);
            return;
        }

        if (wave > lastWave) {
            waveChanges.push({ wave, at });
            waveSamples.push({ wave, at });
            addCrossedBoundaries(lastWave, wave, at, 10);
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

    function getWaveSpanTimeState(spanWaves = 10, now = performance.now()) {
        trim(now);
        if (waveBoundaries.length < 2 || !Number.isFinite(spanWaves) || spanWaves <= 0) {
            return { ready: false, waveTimeSec: NaN, totalTimeSec: NaN, deltaWave: 0 };
        }

        for (let i = waveBoundaries.length - 1; i > 0; i -= 1) {
            const last = waveBoundaries[i];
            const previous = waveBoundaries[i - 1];
            const deltaWave = last.wave - previous.wave;
            if (deltaWave !== spanWaves) {
                continue;
            }

            const deltaMs = last.at - previous.at;
            if (deltaMs <= 0) {
                continue;
            }

            return {
                ready: true,
                waveTimeSec: (deltaMs / 1000) / deltaWave,
                totalTimeSec: deltaMs / 1000,
                deltaWave,
                fromWave: previous.wave,
                toWave: last.wave
            };
        }

        return { ready: false, waveTimeSec: NaN, totalTimeSec: NaN, deltaWave: 0 };
    }

    function reset() {
        waveChanges.length = 0;
        waveSamples.length = 0;
        waveBoundaries.length = 0;
        lastWave = null;
    }

    return { addSample, getWpmState, getWaveSpanTimeState, reset };
}
