/**
 * Currency Safe — localStorage room backend (fallback / 单浏览器多标签)
 */
(function () {
    const S = window.CurrencySafeRoomShared;
    const ROOMS_KEY = "currencySafeRooms_v1";
    const SK = S.SK;
    const subscribers = {};

    function loadRooms() {
        try { return JSON.parse(localStorage.getItem(ROOMS_KEY)) || {}; }
        catch { return {}; }
    }

    function saveRooms(rooms) {
        localStorage.setItem(ROOMS_KEY, JSON.stringify(rooms));
        notifyAll(rooms);
    }

    function notifyAll(rooms) {
        Object.keys(subscribers).forEach(roomId => {
            const room = rooms[roomId];
            if (room) subscribers[roomId].forEach(cb => cb(S.normalizeRoom(roomId, room)));
        });
    }

    function notifyRoom(roomId) {
        const room = getRoom(roomId);
        if (room && subscribers[roomId]) subscribers[roomId].forEach(cb => cb(room));
    }

    function getClientId() {
        let id = sessionStorage.getItem(SK.clientId);
        if (!id) {
            id = S.uid();
            sessionStorage.setItem(SK.clientId, id);
        }
        return id;
    }

    function generateRoomCode() {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        let code = "";
        for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
        if (loadRooms()[code]) return generateRoomCode();
        return code;
    }

    function getRoom(roomId) {
        if (!roomId) return null;
        return S.normalizeRoom(roomId.toUpperCase(), loadRooms()[roomId.toUpperCase()]);
    }

    function saveRoom(room) {
        const rooms = loadRooms();
        rooms[room.id] = room;
        saveRooms(rooms);
    }

    function pushActivity(room, type, message) {
        room.activity = room.activity || [];
        room.activity.unshift({ at: Date.now(), type, message, clientId: getClientId() });
        if (room.activity.length > 100) room.activity.length = 100;
    }

    function getPlayerInRoom(room, playerId) {
        return room.players.find(p => p.id === playerId) || null;
    }

    function createRoom() {
        const id = generateRoomCode();
        const hostId = getClientId();
        const room = {
            id, hostId, mode: "practice", status: "lobby", shuffleRandomStates: false,
            players: [], spectators: [], activity: [], transactions: [], deployLocks: {},
            settings: S.defaultRoomSettings("practice"), createdAt: Date.now()
        };
        pushActivity(room, "room_created", `房间 ${id} 已创建`);
        saveRoom(room);
        sessionStorage.setItem(SK.roomId, id);
        sessionStorage.setItem(SK.roomRole, "host");
        return getRoom(id);
    }

    function joinRoom(roomId) {
        const room = getRoom(roomId);
        if (!room) return { ok: false, error: "找不到房间，请检查房间码。" };
        if (room.status === "ended") return { ok: false, error: "房间已结束。" };
        sessionStorage.setItem(SK.roomId, room.id);
        return { ok: true, room };
    }

    function reconnectRoom(roomId) {
        const id = (roomId || sessionStorage.getItem(SK.roomId) || "").toUpperCase();
        if (!id) return { ok: false, error: "无房间记录。" };
        return joinRoom(id);
    }

    function joinRoomAsPlayer(roomId, name, stateId) {
        const room = getRoom(roomId);
        if (!room) return { ok: false, error: "房间不存在。" };
        if (room.status !== "lobby") return { ok: false, error: "游戏已开始，无法以玩家加入。" };
        const trimmed = (name || "").trim().slice(0, 24);
        if (!trimmed) return { ok: false, error: "请输入队名。" };
        const raw = loadRooms()[room.id];
        const clientId = getClientId();
        raw.spectators = (raw.spectators || []).filter(s => s.id !== clientId);
        const existing = raw.players.find(p => p.id === clientId);
        const coords = S.coordsFromState(stateId);
        if (existing) {
            existing.name = trimmed;
            Object.assign(existing, coords);
        } else {
            if (raw.players.some(p => p.stateId === stateId && p.id !== clientId)) {
                return { ok: false, error: "该州属已被其他队伍选择。" };
            }
            raw.players.push({
                id: clientId, name: trimmed, ...coords, balance: 1000,
                passwordUpdatedAt: Date.now(), wins: 0, losses: 0, agentRank: "trainee", icon: "🧑"
            });
            pushActivity(raw, "player_join", `${trimmed} 加入（${coords.state}）`);
        }
        saveRoom(raw);
        sessionStorage.setItem(SK.roomRole, "player");
        return { ok: true, room: getRoom(room.id) };
    }

    function joinRoomAsSpectator(roomId, name) {
        const room = getRoom(roomId);
        if (!room) return { ok: false, error: "房间不存在。" };
        const raw = loadRooms()[room.id];
        const trimmed = (name || "观战者").trim().slice(0, 24);
        const clientId = getClientId();
        raw.players = raw.players.filter(p => p.id !== clientId);
        let existing = (raw.spectators || []).find(s => s.id === clientId);
        if (existing) existing.name = trimmed;
        else {
            raw.spectators = raw.spectators || [];
            raw.spectators.push({ id: clientId, name: trimmed });
            pushActivity(raw, "spectator_join", `${trimmed} 以观战身份加入`);
        }
        saveRoom(raw);
        sessionStorage.setItem(SK.roomRole, "spectator");
        return { ok: true, room: getRoom(room.id) };
    }

    function setRoomMode(roomId, mode) {
        const raw = loadRooms()[(roomId || "").toUpperCase()];
        if (!raw) return { ok: false, error: "房间不存在。" };
        if (getClientId() !== raw.hostId) return { ok: false, error: "仅房主可更改模式。" };
        raw.mode = mode === "competitive" ? "competitive" : "practice";
        raw.settings = S.defaultRoomSettings(raw.mode);
        pushActivity(raw, "mode_change", `模式改为 ${raw.mode === "practice" ? "练习" : "竞赛"}`);
        saveRoom(raw);
        return { ok: true, room: getRoom(raw.id) };
    }

    function shufflePlayers(roomId, randomStates) {
        const raw = loadRooms()[(roomId || "").toUpperCase()];
        if (!raw) return { ok: false, error: "房间不存在。" };
        if (getClientId() !== raw.hostId) return { ok: false, error: "仅房主可 Shuffle。" };
        if (!raw.players.length) return { ok: false, error: "还没有玩家。" };
        const arr = S.fisherYates(raw.players);
        if (randomStates) S.assignUniqueStates(arr);
        raw.players = arr;
        raw.shuffleRandomStates = !!randomStates;
        pushActivity(raw, "shuffle_teams", randomStates
            ? `Shuffle：顺序已打乱，${arr.length} 名玩家已重新分配州属`
            : `Shuffle：玩家顺序已打乱`);
        saveRoom(raw);
        return { ok: true, room: getRoom(raw.id) };
    }

    function ensureHostAsPlayer(raw) {
        const clientId = getClientId();
        if (clientId !== raw.hostId) return;
        if (raw.players.some(p => p.id === clientId)) {
            sessionStorage.setItem(SK.roomRole, "player");
            return;
        }
        raw.spectators = (raw.spectators || []).filter(s => s.id !== clientId);
        const taken = new Set(raw.players.map(p => p.stateId));
        let stateId = "selangor";
        for (const st of window.MALAYSIA_STATES || []) {
            if (!taken.has(st.id)) { stateId = st.id; break; }
        }
        const coords = S.coordsFromState(stateId);
        raw.players.push({
            id: clientId, name: "房主 Host", ...coords, balance: 1000,
            passwordUpdatedAt: Date.now(), agentRank: "trainee", icon: "🧑"
        });
        sessionStorage.setItem(SK.roomRole, "player");
    }

    function startGame(roomId, force) {
        const raw = loadRooms()[(roomId || "").toUpperCase()];
        if (!raw) return { ok: false, error: "房间不存在。" };
        if (getClientId() !== raw.hostId) return { ok: false, error: "仅房主可开始游戏。" };
        ensureHostAsPlayer(raw);
        if (!force && raw.players.length < 2) {
            return { ok: false, error: "至少需要 2 名玩家才能开始（真人互攻）。" };
        }
        if (raw.players.length < 1) return { ok: false, error: "还没有玩家。" };
        raw.status = "playing";
        raw.matchStartedAt = Date.now();
        raw.leaderboardLocked = raw.settings?.leaderboardLocked ?? (raw.mode === "competitive");
        raw.players.forEach(p => {
            p.missionProgress = S.freshMissionProgress();
        });
        raw.deployLocks = {};
        pushActivity(raw, "game_start", `比赛开始 · ${raw.mode === "practice" ? "练习" : "竞赛"}模式`);
        saveRoom(raw);
        return { ok: true, room: getRoom(raw.id) };
    }

    function setMatchDuration(roomId, minutes) {
        const raw = loadRooms()[(roomId || "").toUpperCase()];
        if (!raw) return { ok: false, error: "房间不存在。" };
        if (getClientId() !== raw.hostId) return { ok: false, error: "仅房主可设置。" };
        if (raw.status !== "lobby") return { ok: false, error: "比赛已开始，无法修改时长。" };
        const m = S.parseMatchMinutes(minutes);
        if (m == null) return { ok: false, error: "请输入至少 1 分钟的有效数字。" };
        raw.settings = raw.settings || S.defaultRoomSettings(raw.mode);
        raw.settings.roundMs = m * 60 * 1000;
        saveRoom(raw);
        return { ok: true, room: getRoom(raw.id) };
    }

    function autoEndGameIfExpired(roomId) {
        const raw = loadRooms()[(roomId || "").toUpperCase()];
        if (!raw || raw.status !== "playing") return { ok: false };
        const remaining = S.getMatchRemainingMs(S.normalizeRoom(raw.id, raw));
        if (remaining == null || remaining > 0) return { ok: false };
        if (raw.status === "ended") return { ok: true, room: getRoom(raw.id) };
        raw.status = "ended";
        raw.endedAt = Date.now();
        pushActivity(raw, "game_end", "比赛时间到，自动结束");
        saveRoom(raw);
        return { ok: true, room: getRoom(raw.id) };
    }

    function endGame(roomId) {
        const raw = loadRooms()[(roomId || "").toUpperCase()];
        if (!raw) return { ok: false, error: "房间不存在。" };
        if (getClientId() !== raw.hostId) return { ok: false, error: "仅房主可结束比赛。" };
        raw.status = "ended";
        raw.endedAt = Date.now();
        pushActivity(raw, "game_end", `房主结束比赛`);
        saveRoom(raw);
        return { ok: true, room: getRoom(raw.id) };
    }

    function kickPlayer(roomId, playerId) {
        const raw = loadRooms()[(roomId || "").toUpperCase()];
        if (!raw) return { ok: false, error: "房间不存在。" };
        if (getClientId() !== raw.hostId) return { ok: false, error: "仅房主可踢人。" };
        const p = raw.players.find(x => x.id === playerId);
        if (!p) return { ok: false, error: "玩家不在房间内。" };
        if (playerId === raw.hostId) return { ok: false, error: "不能踢出房主。" };
        pushActivity(raw, "player_leave", `${p.name} 被房主移出房间`);
        raw.players = raw.players.filter(x => x.id !== playerId);
        saveRoom(raw);
        return { ok: true, room: getRoom(raw.id) };
    }

    function leaveRoom(roomId) {
        const raw = loadRooms()[(roomId || "").toUpperCase()];
        if (!raw) return;
        const clientId = getClientId();
        const p = raw.players.find(x => x.id === clientId);
        if (p) pushActivity(raw, "player_leave", `${p.name} 离开房间`);
        raw.players = raw.players.filter(x => x.id !== clientId);
        raw.spectators = (raw.spectators || []).filter(x => x.id !== clientId);
        if (raw.hostId === clientId && raw.players[0]) raw.hostId = raw.players[0].id;
        saveRoom(raw);
        sessionStorage.removeItem(SK.roomId);
        sessionStorage.removeItem(SK.roomRole);
    }

    function logActivity(roomId, type, message) {
        const raw = loadRooms()[(roomId || "").toUpperCase()];
        if (!raw) return { ok: false, error: "房间不存在。" };
        pushActivity(raw, type, message);
        saveRoom(raw);
        return { ok: true, room: getRoom(raw.id) };
    }

    function claimTargetDeploy(roomId, targetId) {
        const raw = loadRooms()[(roomId || "").toUpperCase()];
        if (!raw) return { ok: false, error: "房间不存在。" };
        const clientId = getClientId();
        if (!getPlayerInRoom(getRoom(raw.id), clientId)) {
            return { ok: false, error: "仅玩家可部署任务。" };
        }
        raw.deployLocks = raw.deployLocks || {};
        const lock = raw.deployLocks[targetId];
        const stale = !lock || Date.now() - (lock.at || 0) > 8 * 60 * 1000;
        if (lock && lock.attackerId !== clientId && !stale) {
            return { ok: false, error: `该目标正被 ${lock.attackerName || "其他特工"} 攻击，请换目标或稍后重试。` };
        }
        const me = raw.players.find(p => p.id === clientId);
        raw.deployLocks[targetId] = { attackerId: clientId, attackerName: me?.name || "", at: Date.now() };
        saveRoom(raw);
        return { ok: true, room: getRoom(raw.id) };
    }

    function applyBreach(roomId, targetId) {
        const raw = loadRooms()[(roomId || "").toUpperCase()];
        if (!raw) return { ok: false, error: "房间不存在。" };
        if (raw.status !== "playing") return { ok: false, error: "比赛未进行中。" };
        const attackerId = getClientId();
        const attacker = raw.players.find(p => p.id === attackerId);
        const target = raw.players.find(p => p.id === targetId);
        if (!attacker) return { ok: false, error: "你不是本房玩家。" };
        if (!target) return { ok: false, error: "目标不存在。" };
        if (attackerId === targetId) return { ok: false, error: "不能攻击自己。" };
        pushActivity(raw, "vault_breach", `${attacker.name} 破解了 ${target.name} 的金库`);
        saveRoom(raw);
        return { ok: true, room: getRoom(raw.id), attacker, target };
    }

    function applyTransfer(roomId, targetId, amount) {
        const raw = loadRooms()[(roomId || "").toUpperCase()];
        if (!raw) return { ok: false, error: "房间不存在。" };
        if (raw.status !== "playing") return { ok: false, error: "比赛未进行中。" };
        const attackerId = getClientId();
        const attacker = raw.players.find(p => p.id === attackerId);
        const target = raw.players.find(p => p.id === targetId);
        if (!attacker || !target) return { ok: false, error: "玩家不存在。" };
        if (attackerId === targetId) return { ok: false, error: "不能转给自己。" };
        const amt = Number(amount);
        if (!amt || amt <= 0) return { ok: false, error: "转账金额无效。" };
        if ((target.balance || 0) < amt) return { ok: false, error: "目标余额不足。" };
        target.balance = (target.balance || 0) - amt;
        attacker.balance = (attacker.balance || 0) + amt;
        target.password = S.randomVaultPassword(8);
        target.passwordUpdatedAt = Date.now();
        raw.transactions = raw.transactions || [];
        raw.transactions.unshift({
            at: Date.now(), from: target.name, to: attacker.name, fromId: targetId, toId: attackerId, amount: amt
        });
        if (raw.transactions.length > 50) raw.transactions.length = 50;
        pushActivity(raw, "transfer", `${attacker.name} 从 ${target.name} 转走 RM ${amt.toLocaleString()}`);
        saveRoom(raw);
        return { ok: true, room: getRoom(raw.id), attacker, target, amount: amt };
    }

    function updatePlayerInRoom(roomId, patch) {
        const raw = loadRooms()[(roomId || "").toUpperCase()];
        if (!raw) return { ok: false, error: "房间不存在。" };
        const p = raw.players.find(x => x.id === getClientId());
        if (!p) return { ok: false, error: "你不是本房玩家。" };
        Object.assign(p, patch);
        saveRoom(raw);
        return { ok: true, room: getRoom(raw.id) };
    }

    function updatePlayerProgress(roomId, progress) {
        const raw = loadRooms()[(roomId || "").toUpperCase()];
        if (!raw) return { ok: false, error: "房间不存在。" };
        const p = raw.players.find(x => x.id === getClientId());
        if (!p) return { ok: false, error: "你不是本房玩家。" };
        p.missionProgress = { ...(p.missionProgress || {}), ...progress };
        if (progress.levels) p.missionProgress.levels = progress.levels;
        saveRoom(raw);
        return { ok: true, room: getRoom(raw.id) };
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
        const role = getSessionRole();
        if (role === "spectator") return false;
        return !!room?.players?.find(p => p.id === getClientId());
    }

    function subscribe(roomId, callback) {
        const id = (roomId || "").toUpperCase();
        if (!subscribers[id]) subscribers[id] = [];
        subscribers[id].push(callback);
        const room = getRoom(id);
        if (room) callback(room);
        return () => {
            subscribers[id] = (subscribers[id] || []).filter(cb => cb !== callback);
        };
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

    window.CurrencySafeRoomLocal = {
        SK, getClientId, createRoom, getRoom, saveRoom, joinRoom, reconnectRoom,
        joinRoomAsPlayer, joinRoomAsSpectator, setRoomMode, shufflePlayers,
        startGame, endGame, kickPlayer, leaveRoom, getSessionRoom, getSessionRole,
        isHost, canWrite, pushActivity: (r, t, m) => pushActivity(r, t, m),
        coordsFromState: S.coordsFromState, updatePlayerInRoom, updatePlayerProgress,
        getRoomSettings, logActivity, applyBreach, applyTransfer, getMaxDeployPerTarget,
        claimTargetDeploy, subscribe, exportRoomCsv, exportRoomReport,
        setMatchDuration, autoEndGameIfExpired,
        backendName: "local"
    };
})();
