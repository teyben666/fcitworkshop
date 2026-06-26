const { loadRoom, saveRoom, roomExists, ensureReady, deleteRoom } = require("./db");
const { stripJoinSecrets } = require("./lib/join-token");
const { S } = require("./lib/load-shared");

class RoomStore {
    constructor() {
        /** @type {Map<string, object>} */
        this.cache = new Map();
        /** @type {Map<string, Set<import('ws').WebSocket>>} */
        this.subscribers = new Map();
        this.ready = this.bootstrap();
    }

    async bootstrap() {
        await ensureReady();
        const { listActiveRooms } = require("./db");
        const rooms = await listActiveRooms();
        this.cache.clear();
        rooms.forEach(raw => {
            if (raw?.id) this.cache.set(raw.id.toUpperCase(), raw);
        });
        console.log(`RoomStore loaded ${this.cache.size} room(s) [${require("./db").backend}]`);
    }

    async reload() {
        await this.bootstrap();
    }

    getRaw(roomId) {
        const id = (roomId || "").toUpperCase();
        if (!id) return null;
        let raw = this.cache.get(id);
        if (!raw) return null;
        raw.players = S.listFromMap(raw.players);
        raw.spectators = S.listFromMap(raw.spectators);
        raw.teams = S.listFromMap(raw.teams);
        raw.activity = S.listFromMap(raw.activity);
        raw.transactions = S.listFromMap(raw.transactions);
        return raw;
    }

    getNormalized(roomId) {
        const raw = this.getRaw(roomId);
        if (!raw) return null;
        return S.normalizeRoom(raw.id, stripJoinSecrets(raw));
    }

    exists(roomId) {
        const id = (roomId || "").toUpperCase();
        return this.cache.has(id);
    }

    save(raw) {
        const id = (raw?.id || "").toUpperCase();
        if (!id) return null;
        S.migrateRoomSchema(raw);
        if (!raw.lastActivityAt) raw.lastActivityAt = Date.now();
        this.cache.set(id, raw);
        Promise.resolve(saveRoom(id, raw)).catch(err => console.error("saveRoom failed", id, err));
        this.broadcast(id, stripJoinSecrets(raw));
        return raw;
    }

    remove(roomId) {
        const id = (roomId || "").toUpperCase();
        if (!id) return;
        this.cache.delete(id);
        Promise.resolve(deleteRoom(id)).catch(err => console.error("deleteRoom failed", id, err));
    }

    addSubscriber(roomId, ws) {
        const id = (roomId || "").toUpperCase();
        if (!this.subscribers.has(id)) this.subscribers.set(id, new Set());
        this.subscribers.get(id).add(ws);
    }

    removeSubscriber(roomId, ws) {
        const id = (roomId || "").toUpperCase();
        const set = this.subscribers.get(id);
        if (!set) return;
        set.delete(ws);
        if (!set.size) this.subscribers.delete(id);
    }

    removeSocket(ws) {
        this.subscribers.forEach((set, roomId) => {
            if (set.delete(ws) && !set.size) this.subscribers.delete(roomId);
        });
    }

    broadcast(roomId, raw) {
        const id = (roomId || "").toUpperCase();
        const set = this.subscribers.get(id);
        if (!set || !set.size) return;
        const payload = JSON.stringify({ type: "room", roomId: id, room: raw });
        set.forEach(sock => {
            if (sock.readyState === 1) sock.send(payload);
        });
    }
}

module.exports = { RoomStore };
