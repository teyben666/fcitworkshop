/**
 * Legacy entry — KrackedMaps preview is implemented in kracked-malaysia-map.js.
 * Load js/vendor/krackedmaps.umd.js + js/kracked-malaysia-map.js before this file.
 */
(function () {
    if (window.MalaysiaMapPreview) return;
    const MAP = window.CurrencySafeMapLayout?.getConfig?.() || { w: 800, h: 353 };
    window.MalaysiaMapPreview = {
        render() {
            console.warn("MalaysiaMapPreview: load kracked-malaysia-map.js");
        },
        MAP
    };
})();
