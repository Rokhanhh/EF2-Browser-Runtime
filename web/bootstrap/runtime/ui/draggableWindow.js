export function installDraggableWindow(node, handle, storageKey) {
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
