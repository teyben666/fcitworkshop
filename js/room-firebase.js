/**
 * Currency Safe — Firebase Realtime Database backend (Phase 5)
 */
(function () {
    const S = window.CurrencySafeRoomShared;
    const SK = S.SK;
    let db = null;
    let cache = {};
    let listeners = {};
    let inited = false;

    function init(cfg) {
        if (inited) return;
        if (!window.firebase) {
            console.warn("Firebase SDK not loaded; staying on local backend.");
            return;
        }
        firebase.initializeApp({
            apiKey: cfg.apiKey,
            authDomain: cfg.authDomain,
            databaseURL: cfg.databaseURL,
            projectId: cfg.projectId,
            storageBucket: cfg.storageBucket,
            messagingSenderId: cfg.messagingSenderId,
            appId: cfg.appId
        });
        db = firebase.database();
        inited = true;
    }

    function roomRef(roomId) {
        return db.ref("rooms/" + (roomId || "").toUpperCase());
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

    function getClientId() {
        let id = sessionStorage.getItem(SK.clientId);
        if (!id) {
            id = S.uid();
            sessionStorage.setItem(SK.clientId, id);
        }
        return id;
    }

    function notifySubs(roomId) {
        const room = getRoom(roomId);
        if (!room) return;
        (listeners[roomId] || []).forEach(cb => cb(room));
    }

    function subscribe(roomId, callback) {
        const id = (roomId || "").toUpperCase();
        if (!listeners[id]) listeners[id] = [];
        listeners[id].push(callback);
        if (!db) return () => {};
        const ref = roomRef(id);
        if (!ref._csSubscribed) {
            ref._csSubscribed = true;
            ref.on("value", snap => {
                setCache(id, snap.val());
                notifySubs(id);
            });
        }
        const room = getRoom(id);
        if (room) callback(room);
        return () => { listeners[id] = (listeners[id] || []).filter(cb => cb !== callback); };
    }

    function generateRoomCode() {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        let code = "";
        for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
        return code;
    }

    function createRoom() {
        const id = generateRoomCode();
        const hostId = getClientId();
        const room = {
            id, hostId, mode: "practice", status: "lobby", shuffleRandomStates: false,
            players: {}, spectators: {}, activity: {}, transactions: {}, deployLocks: {},
            settings: S.defaultRoomSettings("practice"), createdAt: Date.now()
        };
        const actRef = db.ref().push();
        room.activity[actRef.key] = { at: Date.now(), type: "room_created", message: `房间 ${id} 已创建`, clientId: hostId };
        return roomRef(id).set(room).then(() => {
            sessionStorage.setItem(SK.roomId, id);
            sessionStorage.setItem(SK.roomRole, "host");
            setCache(id, room);
            return getRoom(id);
        });
    }

    function pushActivityFb(roomId, type, message) {
        const clientId = getClientId();
        return roomRef(roomId).child("activity").push({ at: Date.now(), type, message, clientId });
    }

    function joinRoom(roomId) {
        const id = (roomId || "").toUpperCase();
        return roomRef(id).once("value").then(snap => {
            if (!snap.exists()) return { ok: false, error: "找不到房间，请检查房间码。" };
            const raw = snap.val();
            if (raw.status === "ended") return { ok: false, error: "房间已结束。" };
            setCache(id, raw);
            sessionStorage.setItem(SK.roomId, id);
            return touchLobbyPresence(id).then(() => ({ ok: true, room: getRoom(id) }));
        });
    }

    function reconnectRoom(roomId) {
        const id = (roomId || sessionStorage.getItem(SK.roomId) || "").toUpperCase();
        if (!id) return Promise.resolve({ ok: false, error: "无房间记录。" });
        return joinRoom(id);
    }

    function joinRoomAsPlayer(roomId, name, stateId) {
        const id = (roomId || "").toUpperCase();
        return joinRoom(id).then(res => {
            if (!res.ok) return res;
            const room = res.room;
            if (room.status !== "lobby") return { ok: false, error: "游戏已开始，无法以玩家加入。" };
            const trimmed = (name || "").trim().slice(0, 24);
            if (!trimmed) return { ok: false, error: "请输入队名。" };
            if (!S.isValidParticipantName(trimmed)) return { ok: false, error: "名称不能为 unknown。" };
            const clientId = getClientId();
            const coords = S.coordsFromState(stateId);
            const existing = room.players.find(p => p.id === clientId);
            if (!existing && room.players.some(p => p.stateId === stateId && p.id !== clientId)) {
                return { ok: false, error: "该州属已被其他队伍选择。" };
            }
            const updates = {};
            updates[`rooms/${id}/spectators/${clientId}`] = null;
            updates[`rooms/${id}/visitors/${clientId}`] = null;
            updates[`rooms/${id}/players/${clientId}`] = {
                ...(existing || {}),
                id: clientId, name: trimmed, ...coords,
                balance: existing?.balance ?? 1000,
                passwordUpdatedAt: existing?.passwordUpdatedAt ?? Date.now(),
                wins: existing?.wins ?? 0, losses: existing?.losses ?? 0,
                agentRank: existing?.agentRank ?? "trainee", icon: "🧑"
            };
            return db.ref().update(updates).then(() => {
                if (!existing) return pushActivityFb(id, "player_join", `${trimmed} 加入（${coords.state}）`);
            }).then(() => {
                sessionStorage.setItem(SK.roomRole, "player");
                return joinRoom(id);
            });
        });
    }

    function joinRoomAsSpectator(roomId, name) {
        const id = (roomId || "").toUpperCase();
        const trimmed = (name || "").trim().slice(0, 24);
        if (!trimmed) return Promise.resolve({ ok: false, error: "请输入观战显示名称。" });
        if (!S.isValidParticipantName(trimmed)) return Promise.resolve({ ok: false, error: "名称不能为 unknown。" });
        const clientId = getClientId();
        return joinRoom(id).then(res => {
            if (!res.ok) return res;
            const existing = res.room.spectators.find(s => s.id === clientId);
            const updates = {};
            updates[`rooms/${id}/players/${clientId}`] = null;
            updates[`rooms/${id}/visitors/${clientId}`] = null;
            updates[`rooms/${id}/spectators/${clientId}`] = { id: clientId, name: trimmed };
            return db.ref().update(updates).then(() => {
                if (!existing) return pushActivityFb(id, "spectator_join", `${trimmed} 以观战身份加入`);
            }).then(() => {
                sessionStorage.setItem(SK.roomRole, "spectator");
                return joinRoom(id);
            });
        });
    }

    function setRoomMode(roomId, mode) {
        const id = (roomId || "").toUpperCase();
        const room = getRoom(id);
        if (!room) return Promise.resolve({ ok: false, error: "房间不存在。" });
        if (getClientId() !== room.hostId) return Promise.resolve({ ok: false, error: "仅房主可更改模式。" });
        const m = mode === "competitive" ? "competitive" : "practice";
        const settings = S.defaultRoomSettings(m);
        return roomRef(id).update({ mode: m, settings }).then(() =>
            pushActivityFb(id, "mode_change", `模式改为 ${m === "practice" ? "练习" : "竞赛"}`)
        ).then(() => ({ ok: true, room: getRoom(id) }));
    }

    function shufflePlayers(roomId, randomStates) {
        const id = (roomId || "").toUpperCase();
        const room = getRoom(id);
        if (!room) return Promise.resolve({ ok: false, error: "房间不存在。" });
        if (getClientId() !== room.hostId) return Promise.resolve({ ok: false, error: "仅房主可 Shuffle。" });
        if (!room.players.length) return Promise.resolve({ ok: false, error: "还没有玩家。" });
        const arr = S.fisherYates([...room.players]);
        if (randomStates) S.assignUniqueStates(arr);
        const players = {};
        arr.forEach((p, i) => { players[p.id] = { ...p, order: i }; });
        const msg = randomStates
            ? `Shuffle：顺序已打乱，${arr.length} 名玩家已重新分配州属`
            : `Shuffle：玩家顺序已打乱`;
        return roomRef(id).update({ players, shuffleRandomStates: !!randomStates }).then(() =>
            pushActivityFb(id, "shuffle_teams", msg)
        ).then(() => ({ ok: true, room: getRoom(id) }));
    }

    function touchLobbyPresence(roomId) {
        const id = (roomId || "").toUpperCase();
        const room = getRoom(id);
        if (!room || room.status !== "lobby") return Promise.resolve({ ok: true });
        const clientId = getClientId();
        if (room.players.some(p => p.id === clientId) || room.spectators.some(s => s.id === clientId)) {
            return roomRef(id).child(`visitors/${clientId}`).remove().then(() => ({ ok: true }));
        }
        return roomRef(id).child(`visitors/${clientId}`).transaction(v => {
            const last = v?.lastSeen || 0;
            if (Date.now() - last < 4000) return;
            return { id: clientId, lastSeen: Date.now() };
        }).then(() => ({ ok: true }));
    }

    function startGame(roomId, force) {
        const id = (roomId || "").toUpperCase();
        const room = getRoom(id);
        if (!room) return Promise.resolve({ ok: false, error: "房间不存在。" });
        if (getClientId() !== room.hostId) return Promise.resolve({ ok: false, error: "仅房主可开始游戏。" });
        const lobbyCheck = S.validateLobbyForStart(room, getClientId());
        if (!lobbyCheck.ok) return Promise.resolve(lobbyCheck);
        const updates = {
            status: "playing",
            matchStartedAt: Date.now(),
            leaderboardLocked: room.settings?.leaderboardLocked ?? (room.mode === "competitive"),
            deployLocks: null
        };
        const players = [...room.players];
        players.forEach(p => {
            updates[`players/${p.id}/missionProgress`] = S.freshMissionProgress();
        });
        if (!force && players.length < 2) {
            return Promise.resolve({ ok: false, error: "至少需要 2 名玩家才能开始（真人互攻）。" });
        }
        if (players.length < 1) return Promise.resolve({ ok: false, error: "还没有玩家。" });
        return roomRef(id).update(updates).then(() =>
            pushActivityFb(id, "game_start", `比赛开始 · ${room.mode === "practice" ? "练习" : "竞赛"}模式`)
        ).then(() => ({ ok: true, room: getRoom(id) }));
    }

    function setMatchDuration(roomId, minutes) {
        const id = (roomId || "").toUpperCase();
        const room = getRoom(id);
        if (!room) return Promise.resolve({ ok: false, error: "房间不存在。" });
        if (getClientId() !== room.hostId) return Promise.resolve({ ok: false, error: "仅房主可设置。" });
        if (room.status !== "lobby") return Promise.resolve({ ok: false, error: "比赛已开始，无法修改时长。" });
        const m = S.parseMatchMinutes(minutes);
        if (m == null) return Promise.resolve({ ok: false, error: "请输入至少 1 分钟的有效数字。" });
        const settings = { ...(room.settings || S.defaultRoomSettings(room.mode)), roundMs: m * 60 * 1000 };
        return roomRef(id).update({ settings }).then(() => ({ ok: true, room: getRoom(id) }));
    }

    function autoEndGameIfExpired(roomId) {
        const id = (roomId || "").toUpperCase();
        return roomRef(id).transaction(room => {
            if (!room || room.status !== "playing" || !room.matchStartedAt) return;
            const norm = S.normalizeRoom(id, room);
            const remaining = S.getMatchRemainingMs(norm);
            if (remaining == null || remaining > 0) return;
            room.status = "ended";
            room.endedAt = Date.now();
            return room;
        }).then(result => {
            if (!result.committed || result.snapshot.val()?.status !== "ended") {
                return { ok: false };
            }
            return pushActivityFb(id, "game_end", "比赛时间到，自动结束").then(() => ({
                ok: true, room: getRoom(id)
            }));
        });
    }

    function endGame(roomId) {
        const id = (roomId || "").toUpperCase();
        const room = getRoom(id);
        if (!room) return Promise.resolve({ ok: false, error: "房间不存在。" });
        if (getClientId() !== room.hostId) return Promise.resolve({ ok: false, error: "仅房主可结束比赛。" });
        return roomRef(id).update({ status: "ended", endedAt: Date.now() }).then(() =>
            pushActivityFb(id, "game_end", "房主结束比赛")
        ).then(() => ({ ok: true, room: getRoom(id) }));
    }

    function kickPlayer(roomId, playerId) {
        const id = (roomId || "").toUpperCase();
        const room = getRoom(id);
        if (!room) return Promise.resolve({ ok: false, error: "房间不存在。" });
        if (getClientId() !== room.hostId) return Promise.resolve({ ok: false, error: "仅房主可踢人。" });
        const p = room.players.find(x => x.id === playerId);
        if (!p) return Promise.resolve({ ok: false, error: "玩家不在房间内。" });
        if (playerId === room.hostId) return Promise.resolve({ ok: false, error: "不能踢出房主。" });
        return pushActivityFb(id, "player_leave", `${p.name} 被房主移出房间`).then(() =>
            roomRef(id).child(`players/${playerId}`).remove()
        ).then(() => ({ ok: true, room: getRoom(id) }));
    }

    function kickSpectator(roomId, spectatorId) {
        const id = (roomId || "").toUpperCase();
        const room = getRoom(id);
        if (!room) return Promise.resolve({ ok: false, error: "房间不存在。" });
        if (getClientId() !== room.hostId) return Promise.resolve({ ok: false, error: "仅房主可踢人。" });
        const s = room.spectators.find(x => x.id === spectatorId);
        if (!s) return Promise.resolve({ ok: false, error: "观战者不在房间内。" });
        return pushActivityFb(id, "player_leave", `${s.name} 被房主移出观战`).then(() =>
            roomRef(id).update({
                [`spectators/${spectatorId}`]: null,
                [`visitors/${spectatorId}`]: { id: spectatorId, lastSeen: 0 }
            })
        ).then(() => ({ ok: true, room: getRoom(id) }));
    }

    function leaveRoom(roomId) {
        const id = (roomId || "").toUpperCase();
        const clientId = getClientId();
        const room = getRoom(id);
        if (!room) return Promise.resolve();
        const p = room.players.find(x => x.id === clientId);
        const updates = {};
        updates[`rooms/${id}/players/${clientId}`] = null;
        updates[`rooms/${id}/spectators/${clientId}`] = null;
        updates[`rooms/${id}/visitors/${clientId}`] = null;
        return (p ? pushActivityFb(id, "player_leave", `${p.name} 离开房间`) : Promise.resolve())
            .then(() => db.ref().update(updates))
            .then(() => {
                if (room.hostId === clientId) {
                    const next = room.players.find(x => x.id !== clientId);
                    if (next) return roomRef(id).update({ hostId: next.id });
                }
            })
            .then(() => {
                sessionStorage.removeItem(SK.roomId);
                sessionStorage.removeItem(SK.roomRole);
            });
    }

    function logActivity(roomId, type, message) {
        return pushActivityFb(roomId, type, message).then(() => ({ ok: true, room: getRoom(roomId) }));
    }

    function claimTargetDeploy(roomId, targetId) {
        const id = (roomId || "").toUpperCase();
        const clientId = getClientId();
        const room = getRoom(id);
        const me = room?.players?.find(p => p.id === clientId);
        if (!me) return Promise.resolve({ ok: false, error: "仅玩家可部署任务。" });
        const lockRef = roomRef(id).child(`deployLocks/${targetId}`);
        return lockRef.transaction(lock => {
            const stale = !lock || Date.now() - (lock.at || 0) > 8 * 60 * 1000;
            if (lock && lock.attackerId !== clientId && !stale) return;
            return { attackerId: clientId, attackerName: me.name, at: Date.now() };
        }).then(result => {
            if (!result.committed) {
                const lock = result.snapshot.val();
                return { ok: false, error: `该目标正被 ${lock?.attackerName || "其他特工"} 攻击，请换目标或稍后重试。` };
            }
            return { ok: true, room: getRoom(id) };
        });
    }

    function applyBreach(roomId, targetId) {
        const id = (roomId || "").toUpperCase();
        const attackerId = getClientId();
        return roomRef(id).transaction(room => {
            if (!room || room.status !== "playing") return room;
            const a = room.players?.[attackerId];
            const t = room.players?.[targetId];
            if (!a || !t || attackerId === targetId) return;
            return room;
        }).then(result => {
            if (!result.committed) return { ok: false, error: "破解同步失败。" };
            const room = getRoom(id);
            const attacker = room?.players?.find(p => p.id === attackerId);
            const target = room?.players?.find(p => p.id === targetId);
            return pushActivityFb(id, "vault_breach", `${attacker?.name} 破解了 ${target?.name} 的金库`).then(() => ({
                ok: true, room, attacker, target
            }));
        });
    }

    function applyTransfer(roomId, targetId, amount) {
        const id = (roomId || "").toUpperCase();
        const attackerId = getClientId();
        const amt = Number(amount);
        let attackerSnap, targetSnap;
        return roomRef(id).transaction(room => {
            if (!room || room.status !== "playing") return room;
            const a = room.players?.[attackerId];
            const t = room.players?.[targetId];
            if (!a || !t || attackerId === targetId || !amt || amt <= 0) return;
            if ((t.balance || 0) < amt) return;
            t.balance = (t.balance || 0) - amt;
            a.balance = (a.balance || 0) + amt;
            t.password = S.randomVaultPassword(8);
            t.passwordUpdatedAt = Date.now();
            attackerSnap = { ...a };
            targetSnap = { ...t };
            return room;
        }).then(result => {
            if (!result.committed) return { ok: false, error: "转账失败或余额不足。" };
            const txRef = roomRef(id).child("transactions").push();
            return txRef.set({
                at: Date.now(), from: targetSnap.name, to: attackerSnap.name,
                fromId: targetId, toId: attackerId, amount: amt
            }).then(() =>
                pushActivityFb(id, "transfer", `${attackerSnap.name} 从 ${targetSnap.name} 转走 RM ${amt.toLocaleString()}`)
            ).then(() => ({
                ok: true, room: getRoom(id), attacker: attackerSnap, target: targetSnap, amount: amt
            }));
        });
    }

    function updatePlayerInRoom(roomId, patch) {
        const id = (roomId || "").toUpperCase();
        const clientId = getClientId();
        const updates = {};
        Object.keys(patch).forEach(k => { updates[`players/${clientId}/${k}`] = patch[k]; });
        return roomRef(id).update(updates).then(() => ({ ok: true, room: getRoom(id) }));
    }

    function updatePlayerProgress(roomId, progress) {
        const id = (roomId || "").toUpperCase();
        const clientId = getClientId();
        return roomRef(id).child(`players/${clientId}/missionProgress`).transaction(mp => ({
            ...(mp || {}), ...progress, levels: progress.levels || mp?.levels
        })).then(() => ({ ok: true, room: getRoom(id) }));
    }

    function getMaxDeployPerTarget(roomId) {
        return getRoom(roomId)?.settings?.maxDeployPerTarget ?? 99;
    }

    function getRoomSettings(roomId) {
        const room = getRoom(roomId);
        return room?.settings || S.defaultRoomSettings("practice");
    }

    function getSessionRoom() {
        const id = sessionStorage.getItem(SK.roomId);
        return id ? getRoom(id) : null;
    }

    function getSessionRole() { return sessionStorage.getItem(SK.roomRole) || ""; }

    function isHost(room) { return room && room.hostId === getClientId(); }

    function canWrite(room) {
        if (getSessionRole() === "spectator") return false;
        return !!room?.players?.find(p => p.id === getClientId());
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
        let text = `Currency Safe 课堂报告\n房间码：${room.id}\n模式：${room.mode}\n\n`;
        text += S.buildCsv(room);
        const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `currency_safe_report_${room.id}.txt`; a.click();
        URL.revokeObjectURL(url);
        return { ok: true };
    }

    window.CurrencySafeRoomFirebase = {
        init, SK, getClientId, createRoom, getRoom,
        joinRoom, reconnectRoom,
        joinRoomAsPlayer,
        joinRoomAsSpectator, setRoomMode, shufflePlayers,
        startGame, endGame, kickPlayer, kickSpectator, leaveRoom,
        getSessionRoom, getSessionRole, isHost, canWrite,
        coordsFromState: S.coordsFromState,
        updatePlayerInRoom, updatePlayerProgress, getRoomSettings,
        logActivity, applyBreach, applyTransfer, getMaxDeployPerTarget,
        claimTargetDeploy, subscribe, exportRoomCsv, exportRoomReport,
        setMatchDuration, autoEndGameIfExpired, touchLobbyPresence,
        backendName: "firebase"
    };
})();
