/** Shared Malaysia map coordinates + state colors (lobby, game, spectator)
 * Anchors synced from krackedmaps STATES centroids — run: npm run map:sync-anchors
 * Map SVG: assets/malaysia-regions.svg (viewBox 0 0 799.85 352.74)
 */
window.MALAYSIA_STATES = [
    { id: "perlis", label: "玻璃市", labelEn: "Perlis", color: "#e879f9", mapX: 7.7, mapY: 15.9, lat: 6.44, lon: 100.2 },
    { id: "kedah", label: "吉打", labelEn: "Kedah", color: "#a78bfa", mapX: 10.4, mapY: 25.3, lat: 6.12, lon: 100.37 },
    { id: "penang", label: "槟城", labelEn: "Penang", color: "#38bdf8", mapX: 8.2, mapY: 32.5, lat: 5.42, lon: 100.33 },
    { id: "perak", label: "霹雳", labelEn: "Perak", color: "#22d3ee", mapX: 13.4, mapY: 41.3, lat: 4.59, lon: 101.09 },
    { id: "kelantan", label: "吉兰丹", labelEn: "Kelantan", color: "#f472b6", mapX: 19.1, mapY: 34.7, lat: 5.31, lon: 102 },
    { id: "terengganu", label: "登嘉楼", labelEn: "Terengganu", color: "#fb7185", mapX: 24.3, mapY: 40, lat: 4.88, lon: 103.13 },
    { id: "pahang", label: "彭亨", labelEn: "Pahang", color: "#fbbf24", mapX: 20.7, mapY: 50.6, lat: 3.81, lon: 103.33 },
    { id: "selangor", label: "雪兰莪", labelEn: "Selangor", color: "#4ade80", mapX: 16.1, mapY: 62.5, lat: 3.07, lon: 101.52 },
    { id: "kl", label: "吉隆坡", labelEn: "Kuala Lumpur", color: "#facc15", mapX: 16.8, mapY: 63.8, lat: 3.14, lon: 101.69 },
    { id: "putrajaya", label: "布城", labelEn: "Putrajaya", color: "#a3e635", mapX: 16.7, mapY: 66.7, lat: 2.93, lon: 101.69 },
    { id: "negeri_sembilan", label: "森美兰", labelEn: "Negeri Sembilan", color: "#34d399", mapX: 19.2, mapY: 71.1, lat: 2.73, lon: 102.25 },
    { id: "melaka", label: "马六甲", labelEn: "Melaka", color: "#fb923c", mapX: 20.6, mapY: 75.8, lat: 2.25, lon: 102.25 },
    { id: "johor", label: "柔佛", labelEn: "Johor", color: "#f87171", mapX: 28, mapY: 81.4, lat: 1.85, lon: 103.76 },
    { id: "sarawak", label: "砂拉越", labelEn: "Sarawak", color: "#60a5fa", mapX: 59.5, mapY: 69.4, lat: 2.5, lon: 113 },
    { id: "sabah", label: "沙巴", labelEn: "Sabah", color: "#c084fc", mapX: 81.8, mapY: 33.5, lat: 5.98, lon: 116.07 },
    { id: "labuan", label: "纳闽", labelEn: "Labuan", color: "#94a3b8", mapX: 70.8, mapY: 33.4, lat: 5.28, lon: 115.24 }
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
