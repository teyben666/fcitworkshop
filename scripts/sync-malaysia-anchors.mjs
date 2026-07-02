/**
 * Sync map anchors from KrackedMaps (phase B).
 * Run: npm run map:sync-anchors
 */
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { STATES, PROJECTION, project } from "krackedmaps/data";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const SLUG_MAP = {
    perlis: "perlis",
    kedah: "kedah",
    penang: "penang",
    perak: "perak",
    kelantan: "kelantan",
    terengganu: "terengganu",
    pahang: "pahang",
    selangor: "selangor",
    kl: "kuala-lumpur",
    putrajaya: "putrajaya",
    negeri_sembilan: "negeri-sembilan",
    melaka: "melaka",
    johor: "johor",
    sarawak: "sarawak",
    sabah: "sabah",
    labuan: "labuan"
};

const EXISTING = [
    { id: "perlis", label: "玻璃市", labelEn: "Perlis", color: "#e879f9", lat: 6.44, lon: 100.20 },
    { id: "kedah", label: "吉打", labelEn: "Kedah", color: "#a78bfa", lat: 6.12, lon: 100.37 },
    { id: "penang", label: "槟城", labelEn: "Penang", color: "#38bdf8", lat: 5.42, lon: 100.33 },
    { id: "perak", label: "霹雳", labelEn: "Perak", color: "#22d3ee", lat: 4.59, lon: 101.09 },
    { id: "kelantan", label: "吉兰丹", labelEn: "Kelantan", color: "#f472b6", lat: 5.31, lon: 102.00 },
    { id: "terengganu", label: "登嘉楼", labelEn: "Terengganu", color: "#fb7185", lat: 4.88, lon: 103.13 },
    { id: "pahang", label: "彭亨", labelEn: "Pahang", color: "#fbbf24", lat: 3.81, lon: 103.33 },
    { id: "selangor", label: "雪兰莪", labelEn: "Selangor", color: "#4ade80", lat: 3.07, lon: 101.52 },
    { id: "kl", label: "吉隆坡", labelEn: "Kuala Lumpur", color: "#facc15", lat: 3.14, lon: 101.69 },
    { id: "putrajaya", label: "布城", labelEn: "Putrajaya", color: "#a3e635", lat: 2.93, lon: 101.69 },
    { id: "negeri_sembilan", label: "森美兰", labelEn: "Negeri Sembilan", color: "#34d399", lat: 2.73, lon: 102.25 },
    { id: "melaka", label: "马六甲", labelEn: "Melaka", color: "#fb923c", lat: 2.25, lon: 102.25 },
    { id: "johor", label: "柔佛", labelEn: "Johor", color: "#f87171", lat: 1.85, lon: 103.76 },
    { id: "sarawak", label: "砂拉越", labelEn: "Sarawak", color: "#60a5fa", lat: 2.50, lon: 113.00 },
    { id: "sabah", label: "沙巴", labelEn: "Sabah", color: "#c084fc", lat: 5.98, lon: 116.07 },
    { id: "labuan", label: "纳闽", labelEn: "Labuan", color: "#94a3b8", lat: 5.28, lon: 115.24 }
];

const CITIES = [
    { name: "KUALA_LUMPUR", label: "吉隆坡", lat: 3.139, lon: 101.686 },
    { name: "GEORGETOWN", label: "槟城", lat: 5.414, lon: 100.329 },
    { name: "JOHOR_BAHRU", label: "新山", lat: 1.493, lon: 103.741 },
    { name: "IPOH", label: "怡保", lat: 4.597, lon: 101.090 },
    { name: "KUCHING", label: "古晋", lat: 1.553, lon: 110.359 },
    { name: "KOTA_KINABALU", label: "亚庇", lat: 5.980, lon: 116.073 },
    { name: "MELAKA", label: "马六甲", lat: 2.194, lon: 102.250 },
    { name: "KUANTAN", label: "关丹", lat: 3.807, lon: 103.326 },
    { name: "KOTA_BHARU", label: "哥打峇鲁", lat: 6.125, lon: 102.238 },
    { name: "MIRI", label: "美里", lat: 4.399, lon: 113.991 }
];

const BANK_BONUS = { lat: 4.2, lon: 108.5, mapX: 50, mapY: 50 };

const bySlug = Object.fromEntries(STATES.map((s) => [s.slug, s]));
const DESIGN_W = PROJECTION.viewW;
const DESIGN_H = PROJECTION.viewH;

function toPct(x, y) {
    return {
        mapX: Math.round((x / DESIGN_W) * 1000) / 10,
        mapY: Math.round((y / DESIGN_H) * 1000) / 10
    };
}

function projectPct(lon, lat) {
    const p = project(lon, lat);
    return toPct(p.x, p.y);
}

const states = EXISTING.map((row) => {
    const slug = SLUG_MAP[row.id];
    const km = bySlug[slug];
    if (!km) {
        console.warn("missing krackedmaps state for", row.id, "->", slug);
        return row;
    }
    const pct = toPct(km.centroid.x, km.centroid.y);
    return { ...row, mapX: pct.mapX, mapY: pct.mapY };
});

const cities = CITIES.map((c) => {
    const pct = projectPct(c.lon, c.lat);
    return { ...c, mapX: pct.mapX, mapY: pct.mapY };
});

const bankPin = { mapX: BANK_BONUS.mapX, mapY: BANK_BONUS.mapY };

console.log("PROJECTION viewBox:", DESIGN_W, "x", DESIGN_H);
states.forEach((s) => console.log(`  ${s.id}: ${s.mapX}, ${s.mapY}`));
console.log("bank bonus pin:", bankPin.mapX, bankPin.mapY);

const stateLines = states.map((s) =>
    `    { id: "${s.id}", label: "${s.label}", labelEn: "${s.labelEn}", color: "${s.color}", mapX: ${s.mapX}, mapY: ${s.mapY}, lat: ${s.lat}, lon: ${s.lon} }`
);

writeFileSync(join(root, "js", "malaysia-states.js"), `/** Shared Malaysia map coordinates + state colors (lobby, game, spectator)
 * Anchors synced from krackedmaps STATES centroids — run: npm run map:sync-anchors
 * Map SVG: assets/malaysia-regions.svg (viewBox 0 0 ${DESIGN_W} ${DESIGN_H})
 */
window.MALAYSIA_STATES = [
${stateLines.join(",\n")}
];

window.getMalaysiaStateById = function (id) {
    return window.MALAYSIA_STATES.find(s => s.id === id) || window.MALAYSIA_STATES[0];
};

window.getStateColor = function (stateId) {
    const st = window.getMalaysiaStateById(stateId);
    return st?.color || "#ff3355";
};

window.getStateLabel = function (stateId, lang) {
    const st = window.getMalaysiaStateById(stateId);
    if (!st) return stateId || "—";
    const useEn = lang === "en" || (!lang && window.CurrencySafeI18n?.getLang?.() === "en");
    if (stateId === "bank" || stateId === "bank_bonus") {
        return useEn ? "Central Bank" : "央行";
    }
    return useEn ? (st.labelEn || st.label) : st.label;
};

window.formatStoredStateLabel = function (entity) {
    if (!entity) return "—";
    if (entity.stateId) return window.getStateLabel(entity.stateId);
    return entity.state || entity.city || "—";
};
`, "utf8");

const cityLines = cities.map((c) =>
    `    { name: "${c.name}", label: "${c.label}", mapX: ${c.mapX}, mapY: ${c.mapY}, lat: ${c.lat}, lon: ${c.lon} }`
);

writeFileSync(join(root, "js", "malaysia-cities.js"), `/** City flash / intel targets — mapX/mapY from krackedmaps project()
 * Regenerate: npm run map:sync-anchors
 */
window.MALAYSIA_CITIES = [
${cityLines.join(",\n")}
];
`, "utf8");

const P = PROJECTION;
writeFileSync(join(root, "js", "map-layout.js"), `/**
 * Shared Malaysia map coordinate system (KrackedMaps projection).
 * Regenerate SVG: npm run map:export-svg | Resync anchors: npm run map:sync-anchors
 */
(function (global) {
    const DESIGN_W = ${DESIGN_W};
    const DESIGN_H = ${DESIGN_H};
    const KM_PROJECTION = ${JSON.stringify(P)};

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
`, "utf8");

writeFileSync(join(root, "js", "bank-bonus-pin.js"), `/** Central bank bonus map pin — map image center (map:sync-anchors) */
window.BANK_BONUS_MAP_PIN = {
    id: "__BANK_BONUS__",
    name: "央行 Bonus",
    mapX: ${bankPin.mapX},
    mapY: ${bankPin.mapY},
    lat: ${BANK_BONUS.lat},
    lon: ${BANK_BONUS.lon},
    state: "海域",
    stateId: "bank_bonus",
    icon: "🏦"
};
`, "utf8");

console.log("Wrote js/malaysia-states.js, js/malaysia-cities.js, js/map-layout.js, js/bank-bonus-pin.js");
