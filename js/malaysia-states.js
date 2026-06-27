/** Shared Malaysia map coordinates + state colors (lobby, game, spectator) */
window.MALAYSIA_STATES = [
    { id: "perlis", label: "玻璃市", labelEn: "Perlis", color: "#e879f9", mapX: 6.3, mapY: 7.2, lat: 6.44, lon: 100.20 },
    { id: "kedah", label: "吉打", labelEn: "Kedah", color: "#a78bfa", mapX: 10.3, mapY: 17.3, lat: 6.12, lon: 100.37 },
    { id: "penang", label: "槟城", labelEn: "Penang", color: "#38bdf8", mapX: 8.4, mapY: 29.4, lat: 5.42, lon: 100.33 },
    { id: "perak", label: "霹雳", labelEn: "Perak", color: "#22d3ee", mapX: 13.1, mapY: 40.1, lat: 4.59, lon: 101.09 },
    { id: "kelantan", label: "吉兰丹", labelEn: "Kelantan", color: "#f472b6", mapX: 21.9, mapY: 29.9, lat: 5.31, lon: 102.00 },
    { id: "terengganu", label: "登嘉楼", labelEn: "Terengganu", color: "#fb7185", mapX: 30.5, mapY: 31.6, lat: 4.88, lon: 103.13 },
    { id: "pahang", label: "彭亨", labelEn: "Pahang", color: "#fbbf24", mapX: 27.1, mapY: 58.7, lat: 3.81, lon: 103.33 },
    { id: "selangor", label: "雪兰莪", labelEn: "Selangor", color: "#4ade80", mapX: 16.7, mapY: 59.5, lat: 3.07, lon: 101.52 },
    { id: "kl", label: "吉隆坡", labelEn: "Kuala Lumpur", color: "#facc15", mapX: 18.9, mapY: 67, lat: 3.14, lon: 101.69 },
    { id: "putrajaya", label: "布城", labelEn: "Putrajaya", color: "#a3e635", mapX: 18.2, mapY: 73.2, lat: 2.93, lon: 101.69 },
    { id: "negeri_sembilan", label: "森美兰", labelEn: "Negeri Sembilan", color: "#34d399", mapX: 23.9, mapY: 73.2, lat: 2.73, lon: 102.25 },
    { id: "melaka", label: "马六甲", labelEn: "Melaka", color: "#fb923c", mapX: 24.3, mapY: 82.9, lat: 2.25, lon: 102.25 },
    { id: "johor", label: "柔佛", labelEn: "Johor", color: "#f87171", mapX: 35.4, mapY: 87.8, lat: 1.85, lon: 103.76 },
    { id: "sarawak", label: "砂拉越", labelEn: "Sarawak", color: "#60a5fa", mapX: 66.6, mapY: 61.3, lat: 2.50, lon: 113.00 },
    { id: "sabah", label: "沙巴", labelEn: "Sabah", color: "#c084fc", mapX: 84.4, mapY: 29.4, lat: 5.98, lon: 116.07 }
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
