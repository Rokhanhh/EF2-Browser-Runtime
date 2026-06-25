import { attachWaveTracker } from "./index.js";
import { installRebirthTierCapture } from "./rebirthTierCapture.js";

export default {
    id: "wave-tracker",
    handleKey: "__EF_WAVE_TRACKER_HANDLE__",

    setup(runtime) {
        const uninstallRebirthTierCapture = installRebirthTierCapture(runtime);
        const handle = attachWaveTracker({
            scanWarnMs: 15000,
            scanHardTimeoutMs: null,
            hooks: runtime.hooks
        });

        return {
            detach() {
                uninstallRebirthTierCapture();
                if (handle && typeof handle.detach === "function") {
                    handle.detach();
                }
            }
        };
    }
};
