const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const ROOMS_FILE = path.join(DATA_DIR, "rooms.json");
const HISTORY_DIR = path.join(DATA_DIR, "history");
const HISTORY_INDEX = path.join(HISTORY_DIR, "index.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });
if (!fs.existsSync(ROOMS_FILE)) fs.writeFileSync(ROOMS_FILE, "{}", "utf8");
if (!fs.existsSync(HISTORY_INDEX)) fs.writeFileSync(HISTORY_INDEX, "[]", "utf8");

function loadAll() {
    try {
        return JSON.parse(fs.readFileSync(ROOMS_FILE, "utf8")) || {};
    } catch {
        return {};
    }
}

function saveAll(rooms) {
    const tmp = `${ROOMS_FILE}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(rooms, null, 0), "utf8");
    fs.renameSync(tmp, ROOMS_FILE);
}

function touchActivity(raw) {
    if (!raw) return;
    raw.lastActivityAt = Date.now();
}

function loadRoom(id) {
    const rooms = loadAll();
    return rooms[(id || "").toUpperCase()] || null;
}

function saveRoom(id, raw) {
    const rid = (id || raw?.id || "").toUpperCase();
    if (!rid || !raw) return;
    raw.id = rid;
    touchActivity(raw);
    const rooms = loadAll();
    rooms[rid] = raw;
    saveAll(rooms);
}

function roomExists(id) {
    return !!loadAll()[(id || "").toUpperCase()];
}

function deleteRoom(id) {
    const rid = (id || "").toUpperCase();
    const rooms = loadAll();
    if (!rooms[rid]) return false;
    delete rooms[rid];
    saveAll(rooms);
    return true;
}

function listActiveRooms() {
    return Object.values(loadAll());
}

function archiveEndedRoom(raw) {
    if (!raw?.id || !raw.endedAt) return null;
    const summary = {
        roomId: raw.id,
        mode: raw.mode,
        endedAt: raw.endedAt,
        startedAt: raw.startedAt || raw.createdAt,
        teamCount: (raw.teams || []).length,
        playerCount: (raw.players || []).length,
        teams: (raw.teams || []).map(t => ({
            id: t.id,
            name: t.name,
            state: t.state,
            vaultBalance: t.vaultBalance
        })),
        playerStats: raw.playerStats || {},
        transactionCount: (raw.transactions || []).length
    };
    const fileName = `${raw.id}_${raw.endedAt}.json`;
    fs.writeFileSync(path.join(HISTORY_DIR, fileName), JSON.stringify(raw, null, 0), "utf8");
    let index = [];
    try {
        index = JSON.parse(fs.readFileSync(HISTORY_INDEX, "utf8")) || [];
    } catch {
        index = [];
    }
    index.unshift({ ...summary, archiveFile: fileName });
    if (index.length > 500) index.length = 500;
    fs.writeFileSync(HISTORY_INDEX, JSON.stringify(index, null, 0), "utf8");
    return { fileName, summary };
}

function listHistory(limit = 50) {
    try {
        const index = JSON.parse(fs.readFileSync(HISTORY_INDEX, "utf8")) || [];
        return index.slice(0, limit);
    } catch {
        return [];
    }
}

function getHistoryMatch(roomId, endedAt) {
    const rid = (roomId || "").toUpperCase();
    const ended = Number(endedAt);
    if (!rid || !ended) return null;
    const fileName = `${rid}_${ended}.json`;
    const filePath = path.join(HISTORY_DIR, fileName);
    if (!fs.existsSync(filePath)) return null;
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
        return null;
    }
}

module.exports = {
    backend: "json",
    loadRoom,
    saveRoom,
    roomExists,
    deleteRoom,
    listActiveRooms,
    archiveEndedRoom,
    listHistory,
    getHistoryMatch,
    HISTORY_DIR
};
