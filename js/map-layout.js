/**
 * Shared Malaysia map coordinate system (KrackedMaps projection).
 * Regenerate SVG: npm run map:export-svg | Resync anchors: npm run map:sync-anchors
 */
(function (global) {
    const DESIGN_W = 799.85;
    const DESIGN_H = 352.74;
    const KM_PROJECTION = {"minx":1.747419824825661,"maxy":0.12329370352362226,"scale":2848.660976322988,"pad":24,"eastLng":107,"shift":240.0879,"offX":31.9088,"offY":5.9369,"viewW":799.85,"viewH":352.74};

    function clampPct(v) {
        return Math.max(1, Math.min(99, v));
    }

    function projectLonLat(lon, lat) {
        const t = KM_PROJECTION;
        const s = Math.PI / 180;
        const P = lon * s;
        const i = Math.log(Math.tan(Math.PI / 4 + lat * s / 2));
        let x = (P - t.minx) * t.scale + t.pad;
        let y = (t.maxy - i) * t.scale + t.pad;
        if (lon >= t.eastLng) x -= t.shift;
        return { x: x + t.offX, y: y + t.offY };
    }

    function computeLayout(wrapW, wrapH, opts) {
        opts = opts || {};
        const zoom = opts.zoom ?? 1;
        const panX = opts.panX ?? 0;
        const panY = opts.panY ?? 0;
        const baseScale = Math.min(wrapW / DESIGN_W, wrapH / DESIGN_H);
        const scale = baseScale * zoom;
        const drawW = DESIGN_W * scale;
        const drawH = DESIGN_H * scale;
        return {
            wrapW, wrapH,
            offsetX: (wrapW - drawW) / 2 + panX,
            offsetY: (wrapH - drawH) / 2 + panY,
            drawW, drawH, scale, baseScale, zoom
        };
    }

    function imagePercentToWrapPercent(mapX, mapY, layout) {
        const px = (mapX / 100) * DESIGN_W;
        const py = (mapY / 100) * DESIGN_H;
        if (!layout?.wrapW) {
            return { x: clampPct(mapX), y: clampPct(mapY) };
        }
        const x = layout.offsetX + (px / DESIGN_W) * layout.drawW;
        const y = layout.offsetY + (py / DESIGN_H) * layout.drawH;
        return {
            x: clampPct((x / layout.wrapW) * 100),
            y: clampPct((y / layout.wrapH) * 100)
        };
    }

    function latLonToDesignXY(lat, lon) {
        return projectLonLat(lon, lat);
    }

    function latLonToWrapPercent(lat, lon, layout) {
        const p = projectLonLat(lon, lat);
        if (!layout?.wrapW) {
            return {
                x: clampPct((p.x / DESIGN_W) * 100),
                y: clampPct((p.y / DESIGN_H) * 100)
            };
        }
        const x = layout.offsetX + (p.x / DESIGN_W) * layout.drawW;
        const y = layout.offsetY + (p.y / DESIGN_H) * layout.drawH;
        return {
            x: clampPct((x / layout.wrapW) * 100),
            y: clampPct((y / layout.wrapH) * 100)
        };
    }

    global.CurrencySafeMapLayout = {
        DESIGN_W,
        DESIGN_H,
        image: "assets/malaysia-regions.svg",
        imageFallback: "malaysia-map.svg",
        projectLonLat,
        computeLayout,
        imagePercentToWrapPercent,
        latLonToDesignXY,
        latLonToWrapPercent,
        getConfig() {
            return {
                w: DESIGN_W,
                h: DESIGN_H,
                image: this.image,
                imageFallback: this.imageFallback
            };
        }
    };
})(window);
