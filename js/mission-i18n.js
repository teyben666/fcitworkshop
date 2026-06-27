/**
 * Mission mini-game strings — uses CurrencySafeI18n catalog keys (mission.*).
 */
(function (global) {
    function mT(key, vars) {
        const I = global.CurrencySafeI18n;
        let s = I?.t?.(key) ?? key;
        if (vars) {
            Object.entries(vars).forEach(([k, v]) => {
                s = s.split(`{${k}}`).join(String(v ?? ""));
            });
        }
        return s;
    }

    global.MissionI18n = { mT };
})(typeof window !== "undefined" ? window : globalThis);
