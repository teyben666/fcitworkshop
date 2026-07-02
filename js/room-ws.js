/**
 * Currency Safe — WebSocket room backend (B0–B2)
 */
(function () {
    const S = window.CurrencySafeRoomShared;
    const SK = S.SK;
    let ws = null;
    let connected = false;
    let connectPromise = null;
    let rpcSeq = 0;
    const pending = new Map();
    const cache = {};
    const listeners = {};
    const connectionListeners = [];
    const subscribedRooms = new Set();
    let activeWsUrl = null;
    let reconnectTimer = null;
    let reconnectAttempt = 0;
    let intentionalClose = false;
    let connectionStatus = "idle";

    function setConnectionStatus(status, detail) {
        connectionStatus = status;
        const payload = { status, detail: detail || "", url: getActiveWsUrl() };
        connectionListeners.forEach(cb => {
            try { cb(payload); } catch (_) { /* ignore */ }
        });
        if (typeof window !== "undefined") {
            window.CURRENCY_SAFE_WS_STATUS = payload;
        }
    }

    function onConnectionChange(cb) {
        connectionListeners.push(cb);
        cb({ status: connectionStatus, detail: "", url: getActiveWsUrl() });
        return () => {
            const i = connectionListeners.indexOf(cb);
            if (i >= 0) connectionListeners.splice(i, 1);
        };
    }

    function getConnectionStatus() {
        return { status: connectionStatus, url: getActiveWsUrl() };
    }

    function scheduleReconnect() {
        if (intentionalClose) return;
        clearTimeout(reconnectTimer);
        reconnectAttempt += 1;
        const delay = Math.min(30000, 1000 * Math.pow(1.5, Math.min(reconnectAttempt, 8)));
        setConnectionStatus("reconnecting", `约 ${Math.round(delay / 1000)} 秒后重试…`);
        reconnectTimer = setTimeout(() => {
            connectPromise = null;
            connect().then(() => {
                reconnectAttempt = 0;
                setConnectionStatus("connected");
            }).catch(() => scheduleReconnect());
        }, delay);
    }

    function isLocalDevHost(host) {
        return host === "localhost" || host === "127.0.0.1"
            || /^192\.168\.\d+\.\d+$/.test(host)
            || /^10\.\d+\.\d+\.\d+$/.test(host)
            || /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host);
    }

    function wsUrlCandidates() {
        const cfg = window.CURRENCY_SAFE_SERVER || {};
        if (cfg.wsUrl && cfg.wsUrl !== "auto") return [cfg.wsUrl];
        const proto = location.protocol === "https:" ? "wss:" : "ws:";
        const host = location.hostname || "localhost";
        const list = [`${proto}//${location.host}/ws`];
        const port = location.port || (location.protocol === "https:" ? "443" : "80");
        if (isLocalDevHost(host) && port !== "8787") {
            list.push(`${proto}//${host}:8787/ws`);
        }
        return [...new Set(list)];
    }

    function getActiveWsUrl() {
        return activeWsUrl || wsUrlCandidates()[0];
    }

    function getClientId() {
        let id = sessionStorage.getItem(SK.clientId);
        if (!id) {
            id = S.uid();
            sessionStorage.setItem(SK.clientId, id);
        }
        return id;
    }

    function setCache(roomId, raw) {
        const id = (roomId || "").toUpperCase();
        if (!raw) { delete cache[id]; return null; }
        cache[id] = S.normalizeRoom(id, raw);
        return cache[id];
    }

    function getRoom(roomId) {
        return cache[(roomId || "").toUpperCase()] || null;
    }

    function notifySubs(roomId) {
        const room = getRoom(roomId);
        if (!room) return;
        (listeners[roomId] || []).forEach(cb => cb(room));
    }

    function send(msg) {
        if (!ws || ws.readyState !== 1) return Promise.reject(new Error("WebSocket 未连接"));
        ws.send(JSON.stringify(msg));
        return Promise.resolve();
    }

    function connectOnce(url) {
        return new Promise((resolve, reject) => {
            let socket;
            try {
                socket = new WebSocket(url);
            } catch (err) {
                reject(err);
                return;
            }
            const timeout = setTimeout(() => {
                try { socket.close(); } catch (_) { /* ignore */ }
                reject(new Error("WebSocket 连接超时"));
            }, 12000);

            socket.onopen = () => {
                socket.send(JSON.stringify({ type: "hello", clientId: getClientId() }));
            };

            socket.onmessage = (ev) => {
                let msg;
                try { msg = JSON.parse(ev.data); } catch { return; }
                if (msg.type === "hello_ok") {
                    clearTimeout(timeout);
                    ws = socket;
                    activeWsUrl = url;
                    connected = true;
                    subscribedRooms.forEach(roomId => {
                        socket.send(JSON.stringify({ type: "subscribe", roomId }));
                    });
                    resolve();
                    return;
                }
                if (msg.type === "room") {
                    setCache(msg.roomId, msg.room);
                    notifySubs(msg.roomId);
                    return;
                }
                if (msg.type === "rpc_result" && msg.id != null) {
                    const p = pending.get(msg.id);
                    if (p) {
                        pending.delete(msg.id);
                        p.resolve(msg.result);
                    }
                }
            };

            socket.onerror = () => {
                clearTimeout(timeout);
                reject(new Error(`无法连接 ${url}`));
            };

            socket.onclose = (ev) => {
                clearTimeout(timeout);
                if (ws !== socket) {
                    reject(new Error(`连接关闭 ${url} (code ${ev.code})`));
                    return;
                }
                connected = false;
                connectPromise = null;
                ws = null;
                if (!intentionalClose) scheduleReconnect();
            };
        });
    }

    function connect() {
        if (connected && ws && ws.readyState === 1) return Promise.resolve();
        if (connectPromise) return connectPromise;
        setConnectionStatus("connecting");
        const candidates = wsUrlCandidates();
        connectPromise = (async () => {
            let lastErr;
            for (const url of candidates) {
                try {
                    await connectOnce(url);
                    setConnectionStatus("connected");
                    return;
                } catch (err) {
                    lastErr = err;
                }
            }
            connectPromise = null;
            const tried = candidates.join(" · ");
            setConnectionStatus("disconnected", lastErr?.message || tried);
            throw lastErr || new Error(`WebSocket 连接失败（${tried}）`);
        })();
        return connectPromise;
    }

    function rpc(method, ...args) {
        return connect().then(() => new Promise((resolve, reject) => {
            const id = `r${++rpcSeq}`;
            const timer = setTimeout(() => {
                if (pending.has(id)) {
                    pending.delete(id);
                    reject(new Error(`RPC 超时：${method}`));
                }
            }, 45000);
            pending.set(id, {
                resolve: (result) => {
                    clearTimeout(timer);
                    resolve(result);
                }
            });
            send({ type: "rpc", id, method, args }).catch(err => {
                clearTimeout(timer);
                pending.delete(id);
                reject(err);
            });
        }));
    }

    function applyRoleFromResult(res) {
        if (res && res.role) sessionStorage.setItem(SK.roomRole, res.role);
    }

    function rememberJoinPassword(password) {
        const pw = S.normalizeJoinPassword(password);
        if (pw) sessionStorage.setItem(SK.roomJoinPassword, pw);
    }

    function subscribe(roomId, callback) {
        const id = (roomId || "").toUpperCase();
        if (!listeners[id]) listeners[id] = [];
        listeners[id].push(callback);
        subscribedRooms.add(id);
        connect().then(() => send({ type: "subscribe", roomId: id })).catch(() => {});
        const room = getRoom(id);
        if (room) callback(room);
        return () => {
            listeners[id] = (listeners[id] || []).filter(cb => cb !== callback);
            if (!listeners[id].length) {
                subscribedRooms.delete(id);
                send({ type: "unsubscribe", roomId: id }).catch(() => {});
            }
        };
    }

    function createRoom(requestedId) {
        return rpc("createRoom", requestedId).then(room => {
            if (room?.id) {
                sessionStorage.setItem(SK.roomId, room.id);
                sessionStorage.setItem(SK.roomRole, "host");
                setCache(room.id, room);
                notifySubs(room.id);
            }
            return room;
        });
    }

    function joinRoom(roomId, password) {
        const pw = password ?? sessionStorage.getItem(SK.roomJoinPassword) ?? "";
        return rpc("joinRoom", roomId, pw).then(res => {
            if (res?.ok && res.room) {
                sessionStorage.setItem(SK.roomId, res.room.id);
                if (pw) rememberJoinPassword(pw);
                setCache(res.room.id, res.room);
                notifySubs(res.room.id);
            }
            return res;
        });
    }

    function ensureRoom(roomId, opts) {
        return rpc("ensureRoom", roomId, opts).then(res => {
            if (res?.ok && res.room) {
                sessionStorage.setItem(SK.roomId, res.room.id);
                if (res.created) sessionStorage.setItem(SK.roomRole, "host");
                setCache(res.room.id, res.room);
                notifySubs(res.room.id);
            }
            return res;
        });
    }

    function reconnectRoom(roomId, password) {
        return joinRoom(roomId || sessionStorage.getItem(SK.roomId), password);
    }

    function wrapRoomResult(method) {
        return function (...args) {
            return rpc(method, ...args).then(res => {
                applyRoleFromResult(res);
                if (res?.room) {
                    setCache(res.room.id, res.room);
                    notifySubs(res.room.id);
                }
                return res;
            });
        };
    }

    function leaveRoom(roomId) {
        return rpc("leaveRoom", roomId).then(res => {
            sessionStorage.removeItem(SK.roomId);
            sessionStorage.removeItem(SK.roomRole);
            sessionStorage.removeItem(SK.roomJoinPassword);
            return res;
        });
    }

    function getSessionRoom() {
        const id = sessionStorage.getItem(SK.roomId);
        return id ? getRoom(id) : null;
    }

    function getSessionRole() {
        return sessionStorage.getItem(SK.roomRole) || "";
    }

    function isHost(room) {
        return room && room.hostId === getClientId();
    }

    function canWrite(room) {
        if (getSessionRole() === "spectator") return false;
        return !!room?.players?.find(p => p.id === getClientId());
    }

    function getRoomSettings(roomId) {
        const room = getRoom(roomId);
        return room?.settings || S.defaultRoomSettings("practice");
    }

    function getMaxDeployPerTarget(roomId) {
        return getRoom(roomId)?.settings?.maxDeployPerTarget ?? 99;
    }

    function getTeamDeployCountRoom(roomOrId, teamId, targetId) {
        const room = typeof roomOrId === "string" ? getRoom(roomOrId) : roomOrId;
        return S.getTeamDeployCount(room, teamId, targetId);
    }

    function exportRoomCsv(roomId) {
        const room = getRoom(roomId);
        if (!room) return { ok: false, error: "房间不存在。" };
        S.downloadCsv(`currency_safe_${room.id}.csv`, S.buildCsv(room));
        return { ok: true };
    }

    function exportRoomReport(roomId) {
        const room = getRoom(roomId);
        if (!room) return { ok: false, error: "房间不存在。" };
        let text = `Currency Safe 课堂报告\n房间码：${room.id}\n模式：${room.mode}\n状态：${room.status}\n\n`;
        text += S.buildCsv(room);
        const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `currency_safe_report_${room.id}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        return { ok: true };
    }

    function saveRoom(room) {
        return rpc("saveRoom", room).then(saved => {
            if (saved?.id) {
                setCache(saved.id, saved);
                notifySubs(saved.id);
            }
            return saved;
        });
    }

    function logActivity(roomId, type, message) {
        return rpc("logActivity", roomId, type, message);
    }

    const RPC_METHODS = [
        "joinRoomAsPlayer", "joinRoomAsSpectator", "setRoomMode", "shufflePlayers",
        "shuffleStatesOnly", "shuffleTeamGroups", "assignPlayerToTeam", "createTeam",
        "setRoomMaxTeamSize", "setRoomMapEffects", "abandonTargetRaid",
        "setRoomJoinPassword",
        "startGame", "endGame", "beginLaunchCountdown", "cancelLaunchCountdown",
        "kickPlayer", "kickSpectator",
        "updatePlayerInRoom", "updatePlayerProgress",
        "applyBreach", "applyTransfer", "applyBankTransfer",
        "beginBankBonus", "confirmBankBonusOpen", "completeBankBonus",
        "claimTargetDeploy", "claimTeamDeploy",
        "setMatchDuration", "autoEndGameIfExpired", "touchLobbyPresence",
        "confirmLobbyName", "leaveTeamToBench",
    ];

    const api = {
        SK,
        backendName: "ws",
        init() { intentionalClose = false; return connect(); },
        getActiveWsUrl,
        getConnectionStatus,
        onConnectionChange,
        getClientId,
        createRoom,
        getRoom,
        saveRoom,
        joinRoom,
        reconnectRoom,
        ensureRoom,
        leaveRoom,
        subscribe,
        getSessionRoom,
        getSessionRole,
        isHost,
        canWrite,
        coordsFromState: S.coordsFromState,
        getRoomSettings,
        getMaxDeployPerTarget,
        getTeamDeployCountRoom,
        exportRoomCsv,
        exportRoomReport,
        logActivity
    };

    RPC_METHODS.forEach(name => {
        api[name] = wrapRoomResult(name);
    });

    api.shufflePlayers = wrapRoomResult("shufflePlayers");

    window.CurrencySafeRoomWs = api;
})();
