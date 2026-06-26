const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const HISTORY_DIR = path.join(DATA_DIR, "history");

/** @type {Map<string, Promise<unknown>>} */
const roomLocks = new Map();

function withRoomLock(roomId, fn) {
    const key = (roomId || "__global__").toUpperCase();
    const prev = roomLocks.get(key) || Promise.resolve();
    const run = prev.then(() => fn()).finally(() => {
        if (roomLocks.get(key) === run) roomLocks.delete(key);
    });
    roomLocks.set(key, run);
    return run;
}

const usePg = !!process.env.DATABASE_URL;
const store = usePg ? require("./pg-store") : require("./json-store");

async function ensureReady() {
    if (store.initPg) await store.initPg();
}

function loadRoom(id) {
    return Promise.resolve(store.loadRoom(id));
}

function saveRoom(id, raw) {
    return Promise.resolve(store.saveRoom(id, raw));
}

function roomExists(id) {
    return Promise.resolve(store.roomExists(id));
}

function deleteRoom(id) {
    return Promise.resolve(store.deleteRoom(id));
}

function listActiveRooms() {
    return Promise.resolve(store.listActiveRooms());
}

function archiveEndedRoom(raw) {
    return Promise.resolve(store.archiveEndedRoom(raw));
}

function listHistory(limit) {
    return Promise.resolve(store.listHistory(limit));
}

function getHistoryMatch(roomId, endedAt) {
    if (store.getHistoryMatch) {
        return Promise.resolve(store.getHistoryMatch(roomId, endedAt));
    }
    return Promise.resolve(require("./json-store").getHistoryMatch(roomId, endedAt));
}

module.exports = {
    backend: store.backend,
    usePg,
    withRoomLock,
    ensureReady,
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
