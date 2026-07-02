/**
 * Currency Safe — game threat map viewport bootstrap (shared pan/zoom wiring).
 * Used by game.html; lobby/spectator use kracked-malaysia-map.js + map-viewport.
 */
(function (global) {
    function layoutApi() {
        return global.CurrencySafeMapLayout;
    }

    function create(opts) {
        const zoomMin = opts.zoomMin ?? 0.85;
        const zoomMax = opts.zoomMax ?? 2.8;
        const mapViewport = global.CurrencySafeMapViewport.create({
            zoom: opts.zoom ?? 1,
            panX: opts.panX ?? 0,
            panY: opts.panY ?? 0,
            zoomMin,
            zoomMax
        });

        function computeMapLayout(wrapW, wrapH) {
            return mapViewport.computeLayout(wrapW, wrapH);
        }

        function zoomMapAt(wrap, clientX, clientY, deltaY, onAfter) {
            if (!wrap) return;
            if (!mapViewport.zoomAt(wrap, clientX, clientY, deltaY)) return;
            if (typeof onAfter === "function") onAfter(mapViewport.getState());
        }

        function setupMapPanning(wrap, onAfter) {
            mapViewport.setupPanning(wrap, () => {
                if (typeof onAfter === "function") onAfter(mapViewport.getState());
            });
        }

        function bindWheel(wrap, onAfter) {
            mapViewport.bindWheel(wrap, () => {
                if (typeof onAfter === "function") onAfter(mapViewport.getState());
            });
        }

        function malaysiaImagePercentToWrapPercent(mapX, mapY, lay) {
            const layout = lay || global.__mapLayout;
            return layoutApi().imagePercentToWrapPercent(mapX, mapY, layout);
        }

        function malaysiaLatLonToPercent(lat, lon, lay) {
            const layout = lay || global.__mapLayout;
            return layoutApi().latLonToWrapPercent(lat, lon, layout);
        }

        return {
            mapViewport,
            computeMapLayout,
            zoomMapAt,
            setupMapPanning,
            bindWheel,
            malaysiaImagePercentToWrapPercent,
            malaysiaLatLonToPercent,
            getState: () => mapViewport.getState()
        };
    }

    global.CurrencySafeGameMapBootstrap = { create };
})(window);
