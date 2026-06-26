const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const SCHEMA_FILE = path.join(__dirname, "schema.sql");

let pool = null;
let ready = null;

function getPool() {
    if (!pool) {
        const url = process.env.DATABASE_URL;
        if (!url) throw new Error("DATABASE_URL not set");
        pool = new Pool({ connectionString: url, max: 10 });
    }
    return pool;
}

async function initPg() {
    if (ready) return ready;
    ready = (async () => {
        const p = getPool();
        const schema = fs.readFileSync(SCHEMA_FILE, "utf8");
        await p.query(schema);
    })();
    return ready;
}

function touchActivity(raw) {
    if (!raw) return;
    raw.lastActivityAt = Date.now();
}

async function loadRoom(id) {
    await initPg();
    const rid = (id || "").toUpperCase();
    const res = await getPool().query("SELECT data FROM rooms WHERE id = $1", [rid]);
    return res.rows[0]?.data || null;
}

async function saveRoom(id, raw) {
    await initPg();
    const rid = (id || raw?.id || "").toUpperCase();
    if (!rid || !raw) return;
    raw.id = rid;
    touchActivity(raw);
    const status = raw.status || "lobby";
    const created = raw.createdAt ? new Date(raw.createdAt) : new Date();
    const lastAct = raw.lastActivityAt ? new Date(raw.lastActivityAt) : new Date();
    await getPool().query(
        `INSERT INTO rooms (id, data, status, created_at, updated_at, last_activity_at)
         VALUES ($1, $2::jsonb, $3, $4, NOW(), $5)
         ON CONFLICT (id) DO UPDATE SET
           data = EXCLUDED.data,
           status = EXCLUDED.status,
           updated_at = NOW(),
           last_activity_at = EXCLUDED.last_activity_at`,
        [rid, JSON.stringify(raw), status, created, lastAct]
    );
}

async function roomExists(id) {
    await initPg();
    const rid = (id || "").toUpperCase();
    const res = await getPool().query("SELECT 1 FROM rooms WHERE id = $1", [rid]);
    return res.rowCount > 0;
}

async function deleteRoom(id) {
    await initPg();
    const rid = (id || "").toUpperCase();
    const res = await getPool().query("DELETE FROM rooms WHERE id = $1", [rid]);
    return res.rowCount > 0;
}

async function listActiveRooms() {
    await initPg();
    const res = await getPool().query("SELECT data FROM rooms");
    return res.rows.map(r => r.data);
}

async function archiveEndedRoom(raw) {
    if (!raw?.id || !raw.endedAt) return null;
    await initPg();
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
    await getPool().query(
        `INSERT INTO match_history (room_id, ended_at, summary, full_data)
         VALUES ($1, $2, $3::jsonb, $4::jsonb)
         ON CONFLICT (room_id, ended_at) DO UPDATE SET
           summary = EXCLUDED.summary,
           full_data = EXCLUDED.full_data`,
        [raw.id, raw.endedAt, JSON.stringify(summary), JSON.stringify(raw)]
    );
    return { fileName: `${raw.id}_${raw.endedAt}.json`, summary };
}

async function listHistory(limit = 50) {
    await initPg();
    const lim = Math.min(100, Math.max(1, Number(limit) || 50));
    const res = await getPool().query(
        `SELECT room_id AS "roomId", ended_at AS "endedAt", summary
         FROM match_history ORDER BY ended_at DESC LIMIT $1`,
        [lim]
    );
    return res.rows.map(row => ({
        ...row.summary,
        roomId: row.roomId,
        endedAt: row.endedAt
    }));
}

async function getHistoryMatch(roomId, endedAt) {
    await initPg();
    const rid = (roomId || "").toUpperCase();
    const ended = Number(endedAt);
    const res = await getPool().query(
        "SELECT full_data FROM match_history WHERE room_id = $1 AND ended_at = $2",
        [rid, ended]
    );
    return res.rows[0]?.full_data || null;
}

module.exports = {
    backend: "postgres",
    initPg,
    loadRoom,
    saveRoom,
    roomExists,
    deleteRoom,
    listActiveRooms,
    archiveEndedRoom,
    listHistory,
    getHistoryMatch
};
