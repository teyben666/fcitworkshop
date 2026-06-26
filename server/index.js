const path = require("path");
const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");
const { RoomStore } = require("./room-store");
const { createRoomHandlers } = require("./handlers/room-handlers");
const db = require("./db");
const { stripJoinSecrets } = require("./lib/join-token");
const { startRoomCleanup } = require("./lib/room-cleanup");

const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.PORT) || 8787;

const app = express();
app.use((req, res, next) => {
    if (req.path === "/" || req.path.endsWith(".html") || req.path.startsWith("/js/")) {
        res.setHeader("Cache-Control", "no-store, must-revalidate");
    }
    next();
});
app.get("/health", (_req, res) => {
    res.json({
        ok: true,
        backend: "ws",
        storage: db.backend,
        postgres: db.usePg,
        port: PORT
    });
});
app.get("/api/history", async (_req, res) => {
    try {
        const limit = Math.min(100, Math.max(1, Number(_req.query.limit) || 50));
        const matches = await db.listHistory(limit);
        res.json({ ok: true, matches });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});
app.get("/api/history/:roomId/:endedAt", async (req, res) => {
    try {
        const match = await db.getHistoryMatch(req.params.roomId, req.params.endedAt);
        if (!match) return res.status(404).json({ ok: false, error: "找不到该场记录。" });
        res.json({ ok: true, match });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});
app.use(express.static(ROOT));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
const store = new RoomStore();
const { dispatch } = createRoomHandlers(store);

const CLIENT_RPC = new Set([
    "createRoom", "saveRoom", "joinRoom", "reconnectRoom", "ensureRoom",
    "joinRoomAsPlayer", "joinRoomAsSpectator", "setRoomMode", "shufflePlayers",
    "shuffleStatesOnly", "shuffleTeamGroups", "assignPlayerToTeam", "createTeam",
    "setRoomJoinPassword",
    "startGame", "endGame", "beginLaunchCountdown", "cancelLaunchCountdown",
    "kickPlayer", "kickSpectator", "leaveRoom",
    "updatePlayerInRoom", "updatePlayerProgress", "logActivity",
    "applyBreach", "applyTransfer", "applyBankTransfer",
    "beginBankBonus", "completeBankBonus",
    "claimTargetDeploy", "claimTeamDeploy",
    "setMatchDuration", "autoEndGameIfExpired", "touchLobbyPresence"
]);

wss.on("connection", (ws) => {
    let clientId = null;
    let helloOk = false;

    ws.on("message", (data) => {
        let msg;
        try {
            msg = JSON.parse(String(data));
        } catch {
            ws.send(JSON.stringify({ type: "error", error: "Invalid JSON" }));
            return;
        }

        if (msg.type === "hello") {
            clientId = String(msg.clientId || "").trim();
            if (!clientId) {
                ws.send(JSON.stringify({ type: "error", error: "Missing clientId" }));
                return;
            }
            helloOk = true;
            ws.send(JSON.stringify({ type: "hello_ok" }));
            return;
        }

        if (!helloOk || !clientId) {
            ws.send(JSON.stringify({ type: "error", error: "Send hello first" }));
            return;
        }

        if (msg.type === "subscribe") {
            const roomId = String(msg.roomId || "").toUpperCase();
            if (!roomId) return;
            store.addSubscriber(roomId, ws);
            const raw = store.getRaw(roomId);
            if (raw) {
                ws.send(JSON.stringify({ type: "room", roomId, room: stripJoinSecrets(raw) }));
            }
            return;
        }

        if (msg.type === "unsubscribe") {
            const roomId = String(msg.roomId || "").toUpperCase();
            if (roomId) store.removeSubscriber(roomId, ws);
            return;
        }

        if (msg.type === "rpc") {
            const method = msg.method;
            const args = Array.isArray(msg.args) ? msg.args : [];
            const rpcId = msg.id;
            if (!CLIENT_RPC.has(method)) {
                ws.send(JSON.stringify({
                    type: "rpc_result",
                    id: rpcId,
                    result: { ok: false, error: `未授权 RPC：${method}` }
                }));
                return;
            }
            (async () => {
                let result;
                try {
                    result = await dispatch(method, args, clientId);
                } catch (err) {
                    console.error("RPC error", method, err);
                    result = { ok: false, error: err.message || "服务器错误" };
                }
                if (ws.readyState === 1) {
                    ws.send(JSON.stringify({ type: "rpc_result", id: rpcId, result }));
                }
            })();
            return;
        }

        ws.send(JSON.stringify({ type: "error", error: "Unknown message type" }));
    });

    ws.on("close", () => store.removeSocket(ws));
    ws.on("error", () => store.removeSocket(ws));
});

server.listen(PORT, () => {
    console.log(`Currency Safe server → http://localhost:${PORT}`);
    console.log(`WebSocket → ws://localhost:${PORT}/ws`);
    console.log(`Storage → ${db.backend}${db.usePg ? " (DATABASE_URL)" : " (JSON file)"}`);
});

store.ready.then(() => {
    startRoomCleanup(store);
}).catch(err => {
    console.error("RoomStore bootstrap failed:", err);
});
