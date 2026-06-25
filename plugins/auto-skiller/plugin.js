import { attachAutoSkiller } from "./index.js";

export default {
    id: "auto-skiller",
    handleKey: "__EF_AUTO_SKILLER_HANDLE__",

    setup(runtime) {
        return attachAutoSkiller({
            scanWarnMs: 15000,
            scanHardTimeoutMs: null,
            hooks: runtime.hooks
        });
    }
};
