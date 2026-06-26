const MIN_VIEWPORT_SIZE = 100;
const MAX_VIEWPORT_SIZE = 10000;

function normalizeDimension(value) {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) {
        return null;
    }
    const rounded = Math.round(numberValue);
    if (rounded < MIN_VIEWPORT_SIZE || rounded > MAX_VIEWPORT_SIZE) {
        return null;
    }
    return rounded;
}

function getDescriptor(target, property) {
    let current = target;
    while (current) {
        const descriptor = Object.getOwnPropertyDescriptor(current, property);
        if (descriptor) {
            return descriptor;
        }
        current = Object.getPrototypeOf(current);
    }
    return null;
}

function defineWindowGetter(property, getter) {
    const descriptor = getDescriptor(window, property);
    if (descriptor && descriptor.configurable === false) {
        return false;
    }
    Object.defineProperty(window, property, {
        configurable: true,
        enumerable: descriptor ? descriptor.enumerable : true,
        get: getter,
    });
    return true;
}

function defineVisualViewportGetter(property, getter) {
    const viewport = window.visualViewport;
    if (!viewport) {
        return false;
    }
    const descriptor = getDescriptor(viewport, property);
    if (descriptor && descriptor.configurable === false) {
        return false;
    }
    Object.defineProperty(viewport, property, {
        configurable: true,
        enumerable: descriptor ? descriptor.enumerable : true,
        get: getter,
    });
    return true;
}

function setStyleValue(style, property, value, priority = "") {
    if (style.getPropertyValue(property) === value && style.getPropertyPriority(property) === priority) {
        return;
    }
    style.setProperty(property, value, priority);
}

function applyVirtualViewportStyles(state) {
    const widthValue = `${state.width}px`;
    const heightValue = `${state.height}px`;
    document.documentElement.classList.add("ef-virtual-viewport");
    setStyleValue(document.documentElement.style, "--ef-virtual-viewport-width", widthValue);
    setStyleValue(document.documentElement.style, "--ef-virtual-viewport-height", heightValue);

    const app = document.getElementById("app");
    if (app) {
        setStyleValue(app.style, "width", widthValue, "important");
        setStyleValue(app.style, "height", heightValue, "important");
        setStyleValue(app.style, "overflow", "hidden");
    }

    const canvas = app?.querySelector("canvas");
    if (canvas) {
        setStyleValue(canvas.style, "width", widthValue, "important");
        setStyleValue(canvas.style, "height", heightValue, "important");
    }
}

function updateGameInitOptions(state) {
    const baseWidth = 640;
    const minHeight = 1137;
    window.__EF_GAME_INIT_OPTIONS__ = {
        width: baseWidth,
        height: Math.max(minHeight, Math.round(baseWidth * (state.height / state.width))),
    };
}

function scheduleStyleApplications(state) {
    const timers = [];
    const applyLater = (delay) => {
        const timer = window.setTimeout(() => applyVirtualViewportStyles(state), delay);
        timers.push(timer);
    };

    requestAnimationFrame(() => applyVirtualViewportStyles(state));
    applyLater(50);
    applyLater(150);
    applyLater(350);
    applyLater(750);
    applyLater(1500);

    return () => {
        for (const timer of timers) {
            window.clearTimeout(timer);
        }
    };
}

export function installVirtualViewport(config) {
    if (window.__efVirtualViewportInstalled) {
        return window.__efVirtualViewportInstalled;
    }

    const enabled = config && config.enabled === true;
    const width = normalizeDimension(config?.width);
    const height = normalizeDimension(config?.height);
    if (!enabled || width === null || height === null) {
        return null;
    }

    const state = { width, height };
    const patched = {
        innerWidth: false,
        innerHeight: false,
        visualViewportWidth: false,
        visualViewportHeight: false,
    };

    try {
        patched.innerWidth = defineWindowGetter("innerWidth", () => state.width);
        patched.innerHeight = defineWindowGetter("innerHeight", () => state.height);
        patched.visualViewportWidth = defineVisualViewportGetter("width", () => state.width);
        patched.visualViewportHeight = defineVisualViewportGetter("height", () => state.height);
    } catch (error) {
        console.warn("[ef-runtime] virtual viewport install failed:", error);
        return null;
    }

    updateGameInitOptions(state);
    applyVirtualViewportStyles(state);
    const cancelScheduledStyles = scheduleStyleApplications(state);

    window.__efVirtualViewportInstalled = {
        get width() {
            return state.width;
        },
        get height() {
            return state.height;
        },
        patched,
        resize(nextWidth, nextHeight) {
            const normalizedWidth = normalizeDimension(nextWidth);
            const normalizedHeight = normalizeDimension(nextHeight);
            if (normalizedWidth === null || normalizedHeight === null) {
                return false;
            }
            state.width = normalizedWidth;
            state.height = normalizedHeight;
            updateGameInitOptions(state);
            applyVirtualViewportStyles(state);
            window.dispatchEvent(new Event("resize"));
            window.visualViewport?.dispatchEvent?.(new Event("resize"));
            return true;
        },
        disconnect() {
            cancelScheduledStyles();
        },
    };

    console.info("[ef-runtime] virtual viewport enabled.", {
        width: state.width,
        height: state.height,
        gameInitOptions: window.__EF_GAME_INIT_OPTIONS__,
        patched,
    });
    return window.__efVirtualViewportInstalled;
}
