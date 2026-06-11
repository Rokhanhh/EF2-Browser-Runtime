import { installObjectPropertyCandidateDetector } from "../property-detector.js";
import { createAutoSkillerOverlay } from "./overlay.js";

const ACTIVE_SKILL_FPS = 60;
const RENDER_INTERVAL_MS = 1000;
const AUTO_SKILL_SCAN_INTERVAL_MS = 50;
const AUTO_SKILL_BASE_DELAY_MIN_MS = 100;
const AUTO_SKILL_BASE_DELAY_MAX_MS = 200;
const AUTO_SKILL_BOOST_DELAY_MIN_MS = 300;
const AUTO_SKILL_BOOST_DELAY_MAX_MS = 500;
const AUTO_SKILL_BOOST_WINDOW_MS = 5 * 60 * 1000;
const AUTO_SKILL_BOOST_TARGET_COUNT = 7;
const AUTO_SKILL_RETRY_MS = 1000;
const ACTIVE_SKILL_METADATA = {
    1: { name: "Judgment Lightning" },
    2: { name: "Heaven and Earth Explosion" },
    3: { name: "Skyblade" },
    4: { name: "Holy Prayer" },
    5: { name: "Wings of Salvation" },
    6: { name: "Musketeer Summon" }
};
const ACTIVE_SKILL_ID_MIN = 1;
const ACTIVE_SKILL_ID_MAX = 6;

function sanitizeNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : NaN;
}

function normalizeSkillId(value) {
    const parsed = Math.floor(sanitizeNumber(value));
    return Number.isFinite(parsed) && parsed >= ACTIVE_SKILL_ID_MIN && parsed <= ACTIVE_SKILL_ID_MAX
        ? parsed
        : NaN;
}

function getActiveSkillName(skillId, fallbackName) {
    const normalized = normalizeSkillId(skillId);
    return Number.isFinite(normalized)
        ? ACTIVE_SKILL_METADATA[normalized]?.name || `Skill ${normalized}`
        : fallbackName;
}

function isPotentialActiveSkillButton(candidate) {
    return candidate
        && typeof candidate === "object"
        && candidate.lblTime
        && candidate.icon
        && candidate.iconOff
        && Number.isFinite(sanitizeNumber(candidate.durationFrames));
}

function isActiveSkillButton(candidate) {
    return isPotentialActiveSkillButton(candidate)
        && typeof candidate.start === "function"
        && typeof candidate.setReady === "function"
        && typeof candidate.setSkillIcon === "function"
        && typeof candidate.onEnter === "function";
}

function installActiveSkillButtonObserver(onCandidate) {
    return installObjectPropertyCandidateDetector(["remainingFrames"], (candidate) => {
        if (!isPotentialActiveSkillButton(candidate)) {
            return;
        }
        try {
            onCandidate(candidate);
        } catch (error) {
            // Keep the game runtime stable if our observer misreads a candidate.
        }
    });
}

function inferSkillIdFromString(value) {
    if (typeof value !== "string" || !value.trim()) {
        return NaN;
    }
    const text = value.trim();
    if (!/skill|active/i.test(text)) {
        return NaN;
    }
    const matches = Array.from(text.matchAll(/(?:^|[^0-9])([1-6])(?:[^0-9]|$)/g));
    return matches.length === 1 ? normalizeSkillId(matches[0][1]) : NaN;
}

function inferSkillIdFromObject(candidate, depth = 0, seen = new Set()) {
    if (!candidate || typeof candidate !== "object" || seen.has(candidate) || depth > 2) {
        return NaN;
    }
    seen.add(candidate);

    for (const key of ["skillId", "activeSkillId", "skillKindNum", "activeSkillKindNum", "kindNum", "skillNo", "skillNum"]) {
        const parsed = normalizeSkillId(candidate[key]);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    for (const key of ["texture", "_texture", "textureCacheIds", "cacheId", "name", "id", "label"]) {
        const value = candidate[key];
        if (Array.isArray(value)) {
            for (const item of value) {
                const parsed = inferSkillIdFromString(item);
                if (Number.isFinite(parsed)) {
                    return parsed;
                }
            }
        } else {
            const parsed = inferSkillIdFromString(String(value || ""));
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }
    }

    for (const key of ["icon", "iconOff", "sprite", "container", "texture", "_texture"]) {
        const parsed = inferSkillIdFromObject(candidate[key], depth + 1, seen);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    return NaN;
}

function readOwnerActiveSkillIds(owner) {
    if (!owner || typeof owner !== "object") {
        return [];
    }

    function normalizeSkillArray(value) {
        if (Array.isArray(value)) {
            const ids = value.map(normalizeSkillId);
            return ids.length >= 1 && ids.length <= 6 && ids.every(Number.isFinite) ? ids : [];
        }
        if (typeof value === "string" && value.includes("|")) {
            const ids = value.split("|").map(normalizeSkillId);
            return ids.length >= 1 && ids.length <= 6 && ids.every(Number.isFinite) ? ids : [];
        }
        return [];
    }

    for (const key of ["activeSkills", "activeSkillIds", "skillIds", "skills", "selectedSkills", "equippedSkills"]) {
        const direct = normalizeSkillArray(owner[key]);
        if (direct.length > 0) {
            return direct;
        }
    }

    for (const nestedKey of ["player", "user", "profile", "hero", "battle", "skill", "skillController", "data"]) {
        const nested = owner[nestedKey];
        if (!nested || typeof nested !== "object") {
            continue;
        }
        for (const key of ["activeSkills", "activeSkillIds", "skillIds", "skills", "selectedSkills", "equippedSkills"]) {
            const nestedValue = normalizeSkillArray(nested[key]);
            if (nestedValue.length > 0) {
                return nestedValue;
            }
        }
    }

    try {
        for (const [key, value] of Object.entries(owner)) {
            if (!/skill/i.test(key)) {
                continue;
            }
            const ids = normalizeSkillArray(value);
            if (ids.length > 0) {
                return ids;
            }
        }
    } catch (error) {
        // Some game objects may not enumerate cleanly.
    }

    return [];
}

function ensureAutoSkillerDebug() {
    if (!window.__EF_AUTO_SKILLER_DEBUG__ || typeof window.__EF_AUTO_SKILLER_DEBUG__ !== "object") {
        window.__EF_AUTO_SKILLER_DEBUG__ = {
            buttons: [],
            ownerSkillIds: [],
            setSkillIconCalls: []
        };
    }
    return window.__EF_AUTO_SKILLER_DEBUG__;
}

function publishButtonDebug(button, slotIndex, skillId, ownerSkillIds = []) {
    try {
        const debug = ensureAutoSkillerDebug();
        debug.ownerSkillIds = ownerSkillIds.slice();
        const entry = {
            slotIndex,
            skillId: Number.isFinite(skillId) ? skillId : null,
            buttonKeys: Object.keys(button || {}).slice(0, 60),
            ownerKeys: Object.keys(findActiveSkillOwner(button) || {}).slice(0, 60)
        };
        debug.buttons = debug.buttons.filter((item) => item.slotIndex !== slotIndex);
        debug.buttons.push(entry);
        debug.buttons.sort((left, right) => left.slotIndex - right.slotIndex);
    } catch (error) {
        // Debug state should never affect gameplay.
    }
}

function recordSetSkillIconCall(button, args) {
    try {
        const slotIndex = Math.floor(sanitizeNumber(button?.id));
        const debug = ensureAutoSkillerDebug();
        const entry = {
            at: new Date().toISOString(),
            slotIndex: Number.isFinite(slotIndex) ? slotIndex : null,
            args: args.map((arg) => {
                if (arg == null || typeof arg !== "object") {
                    return arg;
                }
                return {
                    type: arg.constructor?.name || "Object",
                    keys: Object.keys(arg).slice(0, 20),
                    inferredSkillId: inferSkillIdFromObject(arg)
                };
            })
        };
        debug.setSkillIconCalls.push(entry);
        while (debug.setSkillIconCalls.length > 20) {
            debug.setSkillIconCalls.shift();
        }
    } catch (error) {
        // Debug state should never affect gameplay.
    }
}

function captureSkillIdFromSetSkillIconArgs(button, args) {
    for (const arg of args) {
        const parsed = normalizeSkillId(arg);
        if (Number.isFinite(parsed)) {
            button.__efAutoSkillerSkillId = parsed;
            return parsed;
        }
        if (typeof arg === "string") {
            const fromString = inferSkillIdFromString(arg);
            if (Number.isFinite(fromString)) {
                button.__efAutoSkillerSkillId = fromString;
                return fromString;
            }
        }
        const fromObject = inferSkillIdFromObject(arg);
        if (Number.isFinite(fromObject)) {
            button.__efAutoSkillerSkillId = fromObject;
            return fromObject;
        }
    }
    return NaN;
}

function wrapActiveSkillButtonForSkillIdCapture(button) {
    if (!button || button.__efAutoSkillerSetSkillIconWrapped || typeof button.setSkillIcon !== "function") {
        return;
    }

    const original = button.setSkillIcon;
    try {
        button.setSkillIcon = function wrappedSetSkillIcon(...args) {
            recordSetSkillIconCall(this, args);
            captureSkillIdFromSetSkillIconArgs(this, args);
            return original.apply(this, args);
        };
        button.__efAutoSkillerSetSkillIconWrapped = true;
    } catch (error) {
        // Some game objects may expose non-writable methods.
    }
}

function getActiveSkillIdForButton(button, slotIndex) {
    const direct = normalizeSkillId(button?.__efAutoSkillerSkillId);
    if (Number.isFinite(direct)) {
        return direct;
    }

    const owner = findActiveSkillOwner(button);
    const ownerSkillIds = readOwnerActiveSkillIds(owner);
    const fromOwner = normalizeSkillId(ownerSkillIds[slotIndex]);
    if (Number.isFinite(fromOwner)) {
        button.__efAutoSkillerSkillId = fromOwner;
        return fromOwner;
    }

    const fromButton = inferSkillIdFromObject(button);
    if (Number.isFinite(fromButton)) {
        button.__efAutoSkillerSkillId = fromButton;
        return fromButton;
    }

    return NaN;
}

function extractActiveSkillSlotsFromButtons(buttonRefs) {
    if (!buttonRefs || buttonRefs.size === 0) {
        return [];
    }

    const buttonsBySlot = new Map();
    for (const button of buttonRefs) {
        if (!isActiveSkillButton(button)) {
            continue;
        }
        const slotIndex = Math.floor(sanitizeNumber(button.id));
        if (!Number.isFinite(slotIndex) || slotIndex < 0 || slotIndex >= 3) {
            continue;
        }
        buttonsBySlot.set(slotIndex, button);
    }

    if (buttonsBySlot.size === 0) {
        return [];
    }

    const slots = [];
    for (let index = 0; index < 3; index++) {
        const button = buttonsBySlot.get(index);
        if (!button) {
            continue;
        }

        wrapActiveSkillButtonForSkillIdCapture(button);
        const skillId = getActiveSkillIdForButton(button, index);
        const ownerSkillIds = readOwnerActiveSkillIds(findActiveSkillOwner(button));
        const enabled = button && button.enabled !== false && button._enabled !== false && button.visible !== false;
        const canUse = enabled && button.canUse === true;
        const remainingFrames = button ? Math.max(0, sanitizeNumber(button.remainingFrames)) : NaN;
        const durationFrames = button ? Math.max(0, sanitizeNumber(button.durationFrames)) : NaN;
        const cooldownSec = !canUse && Number.isFinite(remainingFrames) && remainingFrames > 0
            ? Math.ceil(remainingFrames / ACTIVE_SKILL_FPS)
            : NaN;
        const cooldownTotalSec = Number.isFinite(durationFrames) && durationFrames > 0
            ? Math.ceil(durationFrames / ACTIVE_SKILL_FPS)
            : NaN;

        slots.push({
            slot: index + 1,
            id: skillId,
            name: getActiveSkillName(skillId, `Slot ${index + 1}`),
            durationSec: NaN,
            cooldownSec,
            cooldownTotalSec,
            remainingFrames,
            durationFrames,
            isAvailable: canUse,
            availability: canUse ? "Available" : "Unavailable",
            hasButton: !!button,
            timerSec: Number.isFinite(cooldownSec) && cooldownSec > 0 ? cooldownSec : NaN,
            timerKind: Number.isFinite(cooldownSec) && cooldownSec > 0 ? "cooldown" : "ready"
        });
        publishButtonDebug(button, index, skillId, ownerSkillIds);
    }

    return slots;
}

function findActiveSkillButtonBySlot(buttonRefs, slotIndex) {
    if (!buttonRefs || !Number.isFinite(slotIndex)) {
        return null;
    }
    let matchingButton = null;
    for (const button of buttonRefs) {
        if (!isActiveSkillButton(button)) {
            continue;
        }
        if (Math.floor(sanitizeNumber(button.id)) === slotIndex) {
            matchingButton = button;
        }
    }
    return matchingButton;
}

function isActiveSkillButtonEnabled(button) {
    return button
        && button.enabled !== false
        && button._enabled !== false
        && button.visible !== false;
}

function isActiveSkillButtonReady(button) {
    return isActiveSkillButtonEnabled(button) && button.canUse === true;
}

function didSkillPressStartCooldown(button) {
    return button
        && button.canUse === false
        && sanitizeNumber(button.remainingFrames) > 0;
}

function recordActiveSkillPress(detail) {
    try {
        const entry = {
            at: new Date().toISOString(),
            ...detail
        };
        window.__EF_AUTO_SKILLER_LAST_PRESS__ = entry;
        const log = Array.isArray(window.__EF_AUTO_SKILLER_PRESS_LOG__)
            ? window.__EF_AUTO_SKILLER_PRESS_LOG__
            : [];
        log.push(entry);
        while (log.length > 20) {
            log.shift();
        }
        window.__EF_AUTO_SKILLER_PRESS_LOG__ = log;
    } catch (error) {
        // Diagnostics should never interfere with the game.
    }
}

function getActiveSkillIdForPress(activeSkillSlots, slotIndex) {
    if (!Array.isArray(activeSkillSlots) || !Number.isFinite(slotIndex)) {
        return NaN;
    }
    const exactSlot = activeSkillSlots.find((slot) => (
        slot && Math.floor(sanitizeNumber(slot.slot)) === slotIndex + 1
    ));
    const slot = exactSlot || activeSkillSlots[slotIndex];
    return slot ? Math.floor(sanitizeNumber(slot.id)) : NaN;
}

function findActiveSkillOwner(button) {
    let current = button && (button.parent || button._parent);
    for (let depth = 0; current && depth < 8; depth++) {
        if (typeof current.onSkill === "function") {
            return current;
        }
        current = current.parent || current._parent;
    }
    return null;
}

function startActiveSkillButtonCooldown(button) {
    if (typeof button.start === "function") {
        button.start();
        return;
    }
    button.canUse = false;
    button.remainingFrames = sanitizeNumber(button.durationFrames);
    if (button.iconOff) {
        button.iconOff.visible = true;
    }
}

function watchAsyncSkillResult(result) {
    if (result && typeof result.catch === "function") {
        result.catch((error) => {
            console.warn("[ef-auto-skiller] active skill effect failed:", error);
        });
    }
}

function triggerOwnerActiveSkillBySlot(owner, slotIndex) {
    if (typeof owner?.onSkill !== "function") {
        return false;
    }
    const result = owner.onSkill.call(owner, slotIndex);
    watchAsyncSkillResult(result);
    return true;
}

function pressActiveSkillButtonViaOwner(button) {
    if (!isActiveSkillButtonReady(button)) {
        return false;
    }
    const owner = findActiveSkillOwner(button);
    const slotIndex = Math.floor(sanitizeNumber(button.id));
    if (!owner || !Number.isFinite(slotIndex) || slotIndex < 0) {
        return false;
    }
    try {
        if (!triggerOwnerActiveSkillBySlot(owner, slotIndex)) {
            return false;
        }
        startActiveSkillButtonCooldown(button);
        return didSkillPressStartCooldown(button);
    } catch (error) {
        console.warn("[ef-auto-skiller] active skill owner press failed:", error);
    }
    return false;
}

function pressActiveSkillButton(buttonRefs, slotIndex, activeSkillSlots = []) {
    const button = findActiveSkillButtonBySlot(buttonRefs, slotIndex);
    if (!button) {
        recordActiveSkillPress({
            slotIndex,
            result: "no-button",
            buttonCount: buttonRefs?.size ?? 0
        });
        return false;
    }

    const skillId = getActiveSkillIdForPress(activeSkillSlots, slotIndex);
    const before = {
        canUse: button.canUse,
        remainingFrames: sanitizeNumber(button.remainingFrames),
        hasOwner: !!findActiveSkillOwner(button)
    };
    const result = pressActiveSkillButtonViaOwner(button);

    recordActiveSkillPress({
        slotIndex,
        skillId,
        result: result ? "pressed" : "failed",
        before,
        after: {
            canUse: button.canUse,
            remainingFrames: sanitizeNumber(button.remainingFrames)
        }
    });
    return result;
}

function createLiveState() {
    return {
        activeSkillSlots: [],
        activeSkillButtonCount: NaN,
        autoSkillEnabledKeys: {}
    };
}

function buildDerivedState(state) {
    const activeSkillSlots = Array.isArray(state.activeSkillSlots)
        ? state.activeSkillSlots.map((slot) => ({
            ...slot,
            cooldownSec: sanitizeNumber(slot.cooldownSec),
            durationSec: sanitizeNumber(slot.durationSec),
            timerSec: sanitizeNumber(slot.timerSec)
        }))
        : [];
    return {
        ...state,
        activeSkillSlots
    };
}

export function attachAutoSkiller({ scanWarnMs = 15000, scanHardTimeoutMs = null } = {}) {
    const overlay = createAutoSkillerOverlay();

    let uninstallActiveSkillButtonObserver = null;
    let warnTimeoutId = null;
    let hardTimeoutId = null;
    let renderIntervalId = null;
    let autoSkillIntervalId = null;
    let attached = true;
    let autoSkillsEnabled = false;
    let hasVisibleState = false;
    const liveState = createLiveState();
    const activeSkillButtonRefs = new Set();
    const autoSkillEnabledKeys = {};
    const autoSkillLastAttemptAt = new Map();
    const autoSkillReadySinceAt = new Map();
    const autoSkillPendingDelayMs = new Map();
    let autoSkillBoostWindowStartAt = performance.now();
    let autoSkillBoostTargetIndex = 0;
    let autoSkillBoostTargetsMs = [];

    liveState.autoSkillEnabledKeys = autoSkillEnabledKeys;

    window.__EF_AUTO_SKILLER_STATE__ = {
        status: "scanning",
        autoSkills: false,
        autoSkillEnabledKeys
    };
    window.__EF_AUTO_SKILLER_LIVE_STATE__ = liveState;
    window.__EF_AUTO_SKILLER_ACTIVE_SKILL_BUTTONS__ = activeSkillButtonRefs;

    function mergeActiveSkillButtonState() {
        liveState.activeSkillButtonCount = activeSkillButtonRefs.size;
        const activeSkillSlots = extractActiveSkillSlotsFromButtons(activeSkillButtonRefs);
        if (activeSkillSlots.length === 0) {
            return false;
        }
        liveState.activeSkillSlots = activeSkillSlots;
        return true;
    }

    function render() {
        if (!attached) {
            return;
        }
        mergeActiveSkillButtonState();
        overlay.setState(buildDerivedState(liveState));
    }

    function completeScanning() {
        if (warnTimeoutId !== null) {
            window.clearTimeout(warnTimeoutId);
            warnTimeoutId = null;
        }
        if (hardTimeoutId !== null) {
            window.clearTimeout(hardTimeoutId);
            hardTimeoutId = null;
        }
    }

    function setAutoSkillsEnabled(enabled) {
        autoSkillsEnabled = !!enabled;
        if (!autoSkillsEnabled) {
            autoSkillLastAttemptAt.clear();
            autoSkillReadySinceAt.clear();
            autoSkillPendingDelayMs.clear();
        }
        window.__EF_AUTO_SKILLER_STATE__.autoSkills = autoSkillsEnabled;
        overlay.setAutoSkillState(autoSkillsEnabled);
    }

    function getActiveSkillSlotIndex(slot, fallbackIndex) {
        const explicitSlot = Math.floor(sanitizeNumber(slot?.slot));
        return Number.isFinite(explicitSlot) && explicitSlot > 0 ? explicitSlot - 1 : fallbackIndex;
    }

    function setSlotAutoEnabled(slotKey, enabled) {
        if (!slotKey) {
            return;
        }
        autoSkillEnabledKeys[slotKey] = !!enabled;
        if (!enabled) {
            autoSkillReadySinceAt.delete(slotKey);
            autoSkillPendingDelayMs.delete(slotKey);
            autoSkillLastAttemptAt.delete(slotKey);
        }
        liveState.autoSkillEnabledKeys = { ...autoSkillEnabledKeys };
        window.__EF_AUTO_SKILLER_STATE__.autoSkillEnabledKeys = liveState.autoSkillEnabledKeys;
        render();
    }

    function getAutoSkillKey(slotIndex) {
        return `slot:${slotIndex}`;
    }

    function randomDelayBetween(minMs, maxMs) {
        return Math.floor(minMs + Math.random() * (maxMs - minMs + 1));
    }

    function resetAutoSkillBoostWindow(now) {
        autoSkillBoostWindowStartAt = now;
        autoSkillBoostTargetIndex = 0;
        autoSkillBoostTargetsMs = Array.from({ length: AUTO_SKILL_BOOST_TARGET_COUNT }, () => (
            randomDelayBetween(0, AUTO_SKILL_BOOST_WINDOW_MS)
        )).sort((left, right) => left - right);
    }

    function shouldUseBoostDelay(now) {
        if (now - autoSkillBoostWindowStartAt >= AUTO_SKILL_BOOST_WINDOW_MS) {
            resetAutoSkillBoostWindow(now);
        }
        const elapsedMs = now - autoSkillBoostWindowStartAt;
        if (autoSkillBoostTargetIndex < autoSkillBoostTargetsMs.length && elapsedMs >= autoSkillBoostTargetsMs[autoSkillBoostTargetIndex]) {
            autoSkillBoostTargetIndex += 1;
            return true;
        }
        return false;
    }

    function getPendingAutoSkillDelayMs(autoSkillKey, now) {
        if (autoSkillPendingDelayMs.has(autoSkillKey)) {
            return autoSkillPendingDelayMs.get(autoSkillKey) || 0;
        }
        const baseDelayMs = shouldUseBoostDelay(now)
            ? randomDelayBetween(AUTO_SKILL_BOOST_DELAY_MIN_MS, AUTO_SKILL_BOOST_DELAY_MAX_MS)
            : randomDelayBetween(AUTO_SKILL_BASE_DELAY_MIN_MS, AUTO_SKILL_BASE_DELAY_MAX_MS);
        autoSkillPendingDelayMs.set(autoSkillKey, baseDelayMs);
        return baseDelayMs;
    }

    resetAutoSkillBoostWindow(autoSkillBoostWindowStartAt);

    function runAutoSkillPress() {
        if (!attached || !autoSkillsEnabled || !hasVisibleState) {
            return;
        }

        mergeActiveSkillButtonState();

        const activeSkillSlots = Array.isArray(liveState.activeSkillSlots) ? liveState.activeSkillSlots : [];
        const now = performance.now();
        let pressedAny = false;

        for (let index = 0; index < activeSkillSlots.length; index++) {
            const slot = activeSkillSlots[index];
            if (!slot) {
                continue;
            }

            const slotIndex = getActiveSkillSlotIndex(slot, index);
            const autoSkillKey = getAutoSkillKey(slotIndex);
            if (autoSkillEnabledKeys[autoSkillKey] === false) {
                autoSkillReadySinceAt.delete(autoSkillKey);
                autoSkillPendingDelayMs.delete(autoSkillKey);
                continue;
            }

            const button = findActiveSkillButtonBySlot(activeSkillButtonRefs, slotIndex);
            if (!isActiveSkillButtonReady(button)) {
                autoSkillReadySinceAt.delete(autoSkillKey);
                autoSkillPendingDelayMs.delete(autoSkillKey);
                continue;
            }

            if (!autoSkillReadySinceAt.has(autoSkillKey)) {
                autoSkillReadySinceAt.set(autoSkillKey, now);
            }

            const readySinceAt = autoSkillReadySinceAt.get(autoSkillKey) || now;
            if (now - readySinceAt < getPendingAutoSkillDelayMs(autoSkillKey, now)) {
                continue;
            }

            const lastAttemptAt = autoSkillLastAttemptAt.get(autoSkillKey) || 0;
            if (now - lastAttemptAt < AUTO_SKILL_RETRY_MS) {
                continue;
            }

            autoSkillLastAttemptAt.set(autoSkillKey, now);
            if (pressActiveSkillButton(activeSkillButtonRefs, slotIndex, activeSkillSlots)) {
                autoSkillReadySinceAt.delete(autoSkillKey);
                autoSkillPendingDelayMs.delete(autoSkillKey);
                pressedAny = true;
            }
        }

        if (pressedAny) {
            window.setTimeout(() => {
                if (attached) {
                    render();
                }
            }, 0);
        }
    }

    overlay.setScanning();
    overlay.setAutoSkillState(autoSkillsEnabled);
    overlay.onAutoSkillToggle(() => {
        setAutoSkillsEnabled(!autoSkillsEnabled);
        runAutoSkillPress();
    });
    overlay.onSlotAutoToggle((slotKey, enabled) => {
        setSlotAutoEnabled(slotKey, enabled);
    });
    overlay.onSkillAction((slotIndex) => {
        pressActiveSkillButton(activeSkillButtonRefs, slotIndex, liveState.activeSkillSlots);
        window.setTimeout(() => {
            if (attached) {
                render();
            }
        }, 0);
    });

    try {
        uninstallActiveSkillButtonObserver = installActiveSkillButtonObserver((candidate) => {
            activeSkillButtonRefs.add(candidate);
            hasVisibleState = true;
            window.__EF_AUTO_SKILLER_STATE__.status = "live";
            completeScanning();
            render();
        });
    } catch (error) {
        overlay.setError("Detector install failed");
        console.warn("[ef-auto-skiller] detector install failed:", error);
        return { detach() {} };
    }

    renderIntervalId = window.setInterval(() => {
        if (attached && hasVisibleState) {
            render();
        }
    }, RENDER_INTERVAL_MS);
    autoSkillIntervalId = window.setInterval(runAutoSkillPress, AUTO_SKILL_SCAN_INTERVAL_MS);

    warnTimeoutId = window.setTimeout(() => {
        if (!attached) {
            return;
        }
        if (!hasVisibleState) {
            overlay.setError("Still waiting for state...");
            window.__EF_AUTO_SKILLER_STATE__.status = "slow";
            return;
        }
        render();
    }, scanWarnMs);

    if (Number.isFinite(scanHardTimeoutMs) && scanHardTimeoutMs > 0) {
        hardTimeoutId = window.setTimeout(() => {
            if (!hasVisibleState) {
                overlay.setError("State unavailable");
                window.__EF_AUTO_SKILLER_STATE__.status = "timeout";
            }
        }, scanHardTimeoutMs);
    }

    return {
        detach() {
            if (!attached) {
                return;
            }
            attached = false;
            completeScanning();
            if (renderIntervalId !== null) {
                window.clearInterval(renderIntervalId);
                renderIntervalId = null;
            }
            if (autoSkillIntervalId !== null) {
                window.clearInterval(autoSkillIntervalId);
                autoSkillIntervalId = null;
            }
            if (typeof uninstallActiveSkillButtonObserver === "function") {
                uninstallActiveSkillButtonObserver();
                uninstallActiveSkillButtonObserver = null;
            }
            overlay.remove();
            window.__EF_AUTO_SKILLER_STATE__.status = "detached";
        }
    };
}
