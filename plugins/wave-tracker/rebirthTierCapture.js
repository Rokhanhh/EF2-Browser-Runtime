const REBIRTH_TIER_STORAGE_KEY = "__EF_HERO_REBIRTH_MEDAL_TIER_CACHE__";

function isGetBatchUrl(url) {
    return typeof url === "string" && url.toLowerCase().includes("getbatch");
}

function resolveBatchVersion(payload) {
    const candidates = [
        payload && payload.version,
        payload && payload.body && payload.body.version,
        payload && payload.body && payload.body.user && payload.body.user.version,
        window.appBundleVersion
    ];
    for (const candidate of candidates) {
        if (typeof candidate === "string" && candidate.trim()) {
            return candidate.trim();
        }
        if (typeof candidate === "number" && Number.isFinite(candidate)) {
            return String(candidate);
        }
    }
    return "unknown";
}

function extractRebirthMedalTierEntries(payload) {
    const body = payload && payload.body;
    if (!Array.isArray(body)) {
        return [];
    }

    const targetBook = body.find((entry) => (
        entry
        && typeof entry === "object"
        && entry.bookName === "HERO_REBIRTH_MEDAL_TIER"
        && Array.isArray(entry.data)
    ));
    if (!targetBook) {
        return [];
    }

    const rows = targetBook.data.filter((row) => row && typeof row === "object");
    if (rows.length > 0 && typeof rows[0].medal === "string") {
        const values = rows[0].medal
            .split("|")
            .map((value) => Number(value))
            .filter((value) => Number.isFinite(value) && value >= 0);
        const entries = values.map((medalValue, index) => [((index + 1) * 10), medalValue]);
        if (entries.length > 0) {
            return entries;
        }
    }

    const medalKeyCandidates = ["medal", "medals", "rewardMedal", "baseMedal", "reward", "value", "amount"];
    const waveKeyCandidates = ["wave", "level", "tier", "stage"];

    let waveKey = null;
    for (const candidate of waveKeyCandidates) {
        const hasCandidate = rows.some((row) => Number.isFinite(Number(row[candidate])));
        if (hasCandidate) {
            waveKey = candidate;
            break;
        }
    }
    if (!waveKey) {
        const numericKeys = new Map();
        for (const row of rows.slice(0, 20)) {
            for (const key of Object.keys(row)) {
                if (Number.isFinite(Number(row[key]))) {
                    numericKeys.set(key, (numericKeys.get(key) || 0) + 1);
                }
            }
        }
        waveKey = Array.from(numericKeys.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    }

    let medalKey = null;
    for (const candidate of medalKeyCandidates) {
        const hasCandidate = rows.some((row) => Number.isFinite(Number(row[candidate])));
        if (hasCandidate) {
            medalKey = candidate;
            break;
        }
    }
    if (!medalKey) {
        const numericKeys = new Map();
        for (const row of rows.slice(0, 20)) {
            for (const key of Object.keys(row)) {
                if (key === waveKey) {
                    continue;
                }
                if (Number.isFinite(Number(row[key]))) {
                    numericKeys.set(key, (numericKeys.get(key) || 0) + 1);
                }
            }
        }
        medalKey = Array.from(numericKeys.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    }

    const waveToMedal = new Map();
    for (const row of rows) {
        if (!row || typeof row !== "object") {
            continue;
        }
        const rawWave = Number(waveKey ? row[waveKey] : NaN);
        if (!Number.isFinite(rawWave) || rawWave <= 0 || rawWave % 10 !== 0) {
            continue;
        }

        let medalValue = NaN;
        if (medalKey) {
            const rawMedal = Number(row[medalKey]);
            if (Number.isFinite(rawMedal) && rawMedal >= 0) {
                medalValue = rawMedal;
            }
        }
        if (!Number.isFinite(medalValue)) {
            for (const candidate of medalKeyCandidates) {
                const rawMedal = Number(row[candidate]);
                if (Number.isFinite(rawMedal) && rawMedal >= 0) {
                    medalValue = rawMedal;
                    break;
                }
            }
        }
        if (!Number.isFinite(medalValue)) {
            continue;
        }

        waveToMedal.set(Math.floor(rawWave), medalValue);
    }

    return Array.from(waveToMedal.entries()).sort((a, b) => a[0] - b[0]);
}

function restorePersistedStore() {
    let persistedStore = null;
    try {
        const raw = window.localStorage.getItem(REBIRTH_TIER_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object" && parsed.byVersion && typeof parsed.byVersion === "object") {
                persistedStore = parsed;
            }
        }
    } catch (error) {
        // Ignore restore errors.
    }

    if (!window.__EF_BATCH_WAVE_MEDALS__) {
        window.__EF_BATCH_WAVE_MEDALS__ = persistedStore || { byVersion: {}, latestVersion: null };
    }
    if (!window.__EF_BATCH_WAVE_MEDALS__.latestVersion) {
        const versions = Object.keys(window.__EF_BATCH_WAVE_MEDALS__.byVersion || {});
        if (versions.length > 0) {
            window.__EF_BATCH_WAVE_MEDALS__.latestVersion = versions[versions.length - 1];
        }
    }
    if (!window.__EF_HERO_REBIRTH_MEDAL_TIER__) {
        const latestVersion = window.__EF_BATCH_WAVE_MEDALS__.latestVersion;
        if (latestVersion && window.__EF_BATCH_WAVE_MEDALS__.byVersion[latestVersion]) {
            window.__EF_HERO_REBIRTH_MEDAL_TIER__ = window.__EF_BATCH_WAVE_MEDALS__.byVersion[latestVersion];
        }
    }
}

function storeRebirthMedalTier({ payload, sourceUrl }) {
    const sortedEntries = extractRebirthMedalTierEntries(payload);
    if (sortedEntries.length === 0) {
        return;
    }

    const version = resolveBatchVersion(payload);
    const waveToMedal = Object.fromEntries(sortedEntries);

    if (!window.__EF_BATCH_WAVE_MEDALS__) {
        window.__EF_BATCH_WAVE_MEDALS__ = { byVersion: {}, latestVersion: null };
    }

    window.__EF_BATCH_WAVE_MEDALS__.byVersion[version] = {
        version,
        sourceUrl,
        capturedAt: new Date().toISOString(),
        entries: sortedEntries,
        waveToMedal
    };
    window.__EF_BATCH_WAVE_MEDALS__.latestVersion = version;
    window.__EF_HERO_REBIRTH_MEDAL_TIER__ = {
        version,
        sourceUrl,
        capturedAt: new Date().toISOString(),
        entries: sortedEntries,
        waveToMedal
    };

    try {
        window.localStorage.setItem(
            REBIRTH_TIER_STORAGE_KEY,
            JSON.stringify(window.__EF_BATCH_WAVE_MEDALS__)
        );
    } catch (error) {
        // Ignore persistence errors.
    }
}

export function installRebirthTierCapture(runtime) {
    restorePersistedStore();

    return runtime.network.onJsonResponse(async (event) => {
        if (!isGetBatchUrl(event.url)) {
            return;
        }
        try {
            const payload = await event.readJson();
            storeRebirthMedalTier({ payload, sourceUrl: event.url });
        } catch (error) {
            runtime.logger.warn("wave-tracker", "rebirth tier capture failed", error);
        }
    });
}
