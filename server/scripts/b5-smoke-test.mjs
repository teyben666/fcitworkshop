#!/usr/bin/env node
/**
 * B5 smoke test — health + WebSocket RPC happy path.
 * Usage: node scripts/b5-smoke-test.mjs [baseUrl]
 * Default baseUrl: http://localhost:8787
 */
import http from "http";
import https from "https";
import { WebSocket } from "ws";

const base = (process.argv[2] || "http://localhost:8787").replace(/\/$/, "");
const wsBase = base.replace(/^http/, "ws");
const results = [];

function pass(name, detail) {
    results.push({ name, ok: true, detail });
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail) {
    results.push({ name, ok: false, detail });
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

function fetchJson(url) {
    const lib = url.startsWith("https") ? https : http;
    return new Promise((resolve, reject) => {
        lib.get(url, (res) => {
            let body = "";
            res.on("data", (c) => { body += c; });
            res.on("end", () => {
                try { resolve(JSON.parse(body)); }
                catch { reject(new Error(`Invalid JSON from ${url}: ${body.slice(0, 120)}`)); }
            });
        }).on("error", reject);
    });
}

function wsRpc(clientId, method, args = []) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(`${wsBase}/ws`);
        const timer = setTimeout(() => {
            ws.close();
            reject(new Error("WS timeout"));
        }, 15000);
        let helloOk = false;

        ws.on("open", () => {
            ws.send(JSON.stringify({ type: "hello", clientId }));
        });

        ws.on("message", (data) => {
            let msg;
            try { msg = JSON.parse(String(data)); } catch { return; }

            if (msg.type === "hello_ok" && !helloOk) {
                helloOk = true;
                ws.send(JSON.stringify({
                    type: "rpc",
                    id: "1",
                    method,
                    args
                }));
                return;
            }
            if (msg.type === "rpc_result" && msg.id === "1") {
                clearTimeout(timer);
                ws.close();
                resolve(msg.result);
            }
        });

        ws.on("error", (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}

async function main() {
    console.log(`B5 smoke test → ${base}\n`);

    try {
        const health = await fetchJson(`${base}/health`);
        if (health?.ok) pass("GET /health", `backend=${health.backend}`);
        else fail("GET /health", JSON.stringify(health));
    } catch (err) {
        fail("GET /health", err.message);
    }

    const hostId = "SMOKE_HOST_" + Date.now();
    let roomId;

    try {
        const room = await wsRpc(hostId, "createRoom", [""]);
        if (room?.id) {
            roomId = room.id;
            pass("RPC createRoom", roomId);
        } else if (room && typeof room === "object" && !Object.keys(room).length) {
            fail("RPC createRoom", "空对象 {} — 请重启 npm start（旧进程未 await 写锁 Promise）");
        } else fail("RPC createRoom", JSON.stringify(room));
    } catch (err) {
        fail("RPC createRoom", err.message);
    }

    if (roomId) {
        const guestId = "SMOKE_GUEST_" + Date.now();
        try {
            const join = await wsRpc(guestId, "joinRoom", [roomId, ""]);
            if (join?.ok) pass("RPC joinRoom", guestId);
            else fail("RPC joinRoom", JSON.stringify(join));
        } catch (err) {
            fail("RPC joinRoom", err.message);
        }

        try {
            const pw = await wsRpc(hostId, "setRoomJoinPassword", [roomId, true, "TESTTOKEN12"]);
            const token = pw?.joinToken || "TESTTOKEN12";
            if (pw?.ok) pass("RPC setRoomJoinPassword");
            else fail("RPC setRoomJoinPassword", JSON.stringify(pw));

            const bad = await wsRpc("SMOKE_BAD_" + Date.now(), "joinRoom", [roomId, "wrong"]);
            if (bad?.ok === false && bad?.needsPassword) pass("joinRoom rejects bad token");
            else fail("joinRoom token gate", JSON.stringify(bad));

            const good = await wsRpc("SMOKE_OK_" + Date.now(), "joinRoom", [roomId, token]);
            if (good?.ok) pass("joinRoom accepts valid token");
            else fail("joinRoom valid token", JSON.stringify(good));
        } catch (err) {
            fail("RPC setRoomJoinPassword", err.message);
        }

        try {
            const shuffle = await wsRpc(hostId, "shuffleStatesOnly", [roomId]);
            if (shuffle?.ok === false && shuffle?.error?.includes("还没有")) {
                pass("RPC shuffleStatesOnly (no players yet)", shuffle.error);
            } else if (shuffle?.ok) pass("RPC shuffleStatesOnly");
            else pass("RPC shuffleStatesOnly", shuffle?.error || "reachable");
        } catch (err) {
            fail("RPC shuffleStatesOnly", err.message);
        }
    }

    try {
        const hist = await fetchJson(`${base}/api/history?limit=5`);
        if (hist?.ok && Array.isArray(hist.matches)) pass("GET /api/history", `${hist.matches.length} entries`);
        else fail("GET /api/history", JSON.stringify(hist));
    } catch (err) {
        fail("GET /api/history", err.message);
    }

    const failed = results.filter(r => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} passed`);
    process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
