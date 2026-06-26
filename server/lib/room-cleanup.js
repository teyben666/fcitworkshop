const db = require("../db");

const LOBBY_IDLE_MS = Number(process.env.ROOM_LOBBY_IDLE_MS) || 24 * 60 * 60 * 1000;
const ENDED_RETAIN_MS = Number(process.env.ROOM_ENDED_RETAIN_MS) || 2 * 60 * 60 * 1000;
const INTERVAL_MS = Number(process.env.ROOM_CLEANUP_INTERVAL_MS) || 60 * 60 * 1000;

function lastActivityMs(raw) {
    return Number(raw?.lastActivityAt)
        || Number(raw?.endedAt)
        || Number(raw?.createdAt)
        || 0;
}

async function cleanupIdleRooms(store) {
    const now = Date.now();
    const rooms = store
        ? [...store.cache.values()]
        : await db.listActiveRooms();
    let removed = 0;

    for (const raw of rooms) {
        if (!raw?.id) continue;
        const idle = now - lastActivityMs(raw);

        if (raw.status === "ended" && idle >= ENDED_RETAIN_MS) {
            if (store) store.remove(raw.id);
            else await db.deleteRoom(raw.id);
            removed += 1;
            continue;
        }

        if (raw.status === "lobby" && idle >= LOBBY_IDLE_MS) {
            const playerCount = (raw.players || []).length;
            const visitorCount = raw.visitors
                ? (Array.isArray(raw.visitors) ? raw.visitors.length : Object.keys(raw.visitors).length)
                : 0;
            if (playerCount === 0 && visitorCount <= 1) {
                if (store) store.remove(raw.id);
                else await db.deleteRoom(raw.id);
                removed += 1;
            }
        }
    }

    if (removed > 0) {
        console.log(`[cleanup] removed ${removed} idle room(s)`);
    }
    return removed;
}

function startRoomCleanup(store) {
    const tick = () => {
        cleanupIdleRooms(store).catch(err => console.error("[cleanup] error", err));
    };
    tick();
    return setInterval(tick, INTERVAL_MS);
}

module.exports = { startRoomCleanup, cleanupIdleRooms, LOBBY_IDLE_MS, ENDED_RETAIN_MS };
