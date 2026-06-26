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

    if (typeof window !== "undefined") {
        window.addEventListener("storage", (e) => {
            if (e.key !== ROOMS_KEY || !e.newValue) return;
            try {
                notifyAll(JSON.parse(e.newValue));
            } catch (_) { /* ignore */ }
        });
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

    function createRoom(requestedId) {
        const id = (requestedId || "").trim().toUpperCase() || generateRoomCode();
        if (loadRooms()[id]) return getRoom(id);
        const hostId = getClientId();
        const room = {
            id, hostId, mode: "practice", status: "lobby", shuffleRandomStates: false,
            joinPasswordEnabled: false, joinPassword: "",
            players: [], spectators: [], teams: [], activity: [], transactions: [],
            deployLocks: {}, teamDeployCounts: {}, targetRaids: {}, bankBonus: null,
            bank: S.defaultBank(),
            settings: S.defaultRoomSettings("practice"), createdAt: Date.now()
        };
        S.ensureVaultCredentials(room.bank);
        pushActivity(room, "room_created", `房间 ${id} 已创建`);
        saveRoom(room);
        sessionStorage.setItem(SK.roomId, id);
        sessionStorage.setItem(SK.roomRole, "host");
        return getRoom(id);
    }

    function ensureRoom(roomId, opts) {
        const id = (roomId || "").toUpperCase();
        if (!id) return { ok: false, error: "无房间码。" };
        const existing = getRoom(id);
        if (existing) {
            if (existing.status === "ended") return { ok: false, error: "房间已结束。" };
            sessionStorage.setItem(SK.roomId, id);
            touchLobbyPresence(id);
            return { ok: true, room: existing };
        }
        if (!(opts && opts.adoptIfMissing)) {
            return { ok: false, error: "找不到房间，请从主页创建或加入。" };
        }
        const room = createRoom(id);
        return { ok: true, room, created: true };
    }

    function joinRoom(roomId, password) {
        const room = getRoom(roomId);
        if (!room) return { ok: false, error: "找不到房间，请检查房间码。" };
        if (room.status === "ended") return { ok: false, error: "房间已结束。" };
        const raw = loadRooms()[room.id];
        const clientId = getClientId();
        if (S.needsJoinPassword(raw, clientId) && !S.verifyJoinPassword(raw, password)) {
            return { ok: false, error: "房间密码不正确。", needsPassword: true };
        }
        sessionStorage.setItem(SK.roomId, room.id);
        touchLobbyPresence(room.id);
        return { ok: true, room };
    }

    function reconnectRoom(roomId, password) {
        const id = (roomId || sessionStorage.getItem(SK.roomId) || "").toUpperCase();
        if (!id) return { ok: false, error: "无房间记录。" };
        const pw = password ?? sessionStorage.getItem(SK.roomJoinPassword) ?? "";
        return joinRoom(id, pw);
    }

    function setRoomJoinPassword(roomId, enabled, password) {
        const raw = loadRooms()[(roomId || "").toUpperCase()];
        if (!raw) return { ok: false, error: "房间不存在。" };
        if (getClientId() !== raw.hostId) return { ok: false, error: "仅房主可设置进房令牌。" };
        if (raw.status !== "lobby") return { ok: false, error: "比赛已开始，无法修改进房令牌。" };
        const JT = window.CurrencySafeJoinToken;
        raw.joinPasswordEnabled = !!enabled;
        let joinToken = null;
        if (raw.joinPasswordEnabled) {
            let token = JT ? JT.normalizeJoinToken(password) : S.normalizeJoinPassword(password);
            if (!token && JT) token = JT.generateJoinToken();
            if (!token) return { ok: false, error: "请生成进房令牌或输入至少 4 位。" };
            if (JT) {
                raw.joinTokenHash = JT.hashJoinToken(token);
                delete raw.joinPassword;
            } else {
                raw.joinPassword = token;
            }
            joinToken = token;
            pushActivity(raw, "room_password", "房主已开启进房令牌");
        } else {
            raw.joinTokenHash = "";
            delete raw.joinPassword;
            pushActivity(raw, "room_password", "房主已关闭进房令牌");
        }
        saveRoom(raw);
        const res = { ok: true, room: getRoom(raw.id) };
        if (joinToken) res.joinToken = joinToken;
        return res;
    }

    function joinRoomAsPlayer(roomId, name, stateId, teamId) {
        const room = getRoom(roomId);
        if (!room) return { ok: false, error: "房间不存在。" };
        if (room.status !== "lobby") return { ok: false, error: "游戏已开始，无法以玩家加入。" };
        const trimmed = (name || "").trim().slice(0, 24);
        if (!trimmed) return { ok: false, error: "请输入队名。" };
        if (!S.isValidParticipantName(trimmed)) return { ok: false, error: "名称不能为 unknown。" };
        const raw = loadRooms()[room.id];
        S.ensureTeamsAndBank(raw);
        const clientId = getClientId();
        raw.spectators = (raw.spectators || []).filter(s => s.id !== clientId);
        if (raw.visitors) delete raw.visitors[clientId];
        const existing = raw.players.find(p => p.id === clientId);
        const maxTeam = raw.settings?.maxTeamSize || 4;

        if (teamId) {
            const team = (raw.teams || []).find(t => t.id === teamId);
            if (!team) return { ok: false, error: "队伍不存在。" };
            if ((team.memberIds || []).length >= maxTeam && !(team.memberIds || []).includes(clientId)) {
                return { ok: false, error: "该队已满（最多 4 人）。" };
            }
            if (existing) {
                (raw.teams || []).forEach(t => {
                    t.memberIds = (t.memberIds || []).filter(id => id !== clientId);
                });
                existing.name = trimmed;
                existing.teamId = teamId;
                if (!(team.memberIds || []).includes(clientId)) team.memberIds.push(clientId);
            } else {
                raw.players.push({
                    id: clientId, name: trimmed, teamId,
                    balance: 0, password: S.randomVaultPassword(8),
                    passwordUpdatedAt: Date.now(), wins: 0, losses: 0, agentRank: "trainee", icon: "🧑"
                });
                team.memberIds = team.memberIds || [];
                if (!team.memberIds.includes(clientId)) team.memberIds.push(clientId);
                pushActivity(raw, "player_join", `${trimmed} 加入 ${team.state || "队伍"}`);
            }
            S.syncPlayersFromTeams(raw.players, raw.teams);
        } else {
            if (raw.teams.some(t => t.stateId === stateId && !(t.memberIds || []).includes(clientId))) {
                return { ok: false, error: "该州属已被其他队伍选择。" };
            }
            const coords = S.coordsFromState(stateId);
            if (existing) {
                (raw.teams || []).forEach(t => {
                    t.memberIds = (t.memberIds || []).filter(id => id !== clientId);
                });
                existing.name = trimmed;
                const tid = S.createTeamId();
                existing.teamId = tid;
                raw.teams = raw.teams || [];
                raw.teams.push(S.newTeamRecord({
                    id: tid, name: trimmed, ...coords, memberIds: [clientId]
                }));
                const newTeam = raw.teams[raw.teams.length - 1];
                S.ensureVaultCredentials(newTeam);
                S.syncTeamPasswordToMembers(raw, newTeam);
            } else {
                const tid = S.createTeamId();
                raw.players.push({
                    id: clientId, name: trimmed, teamId: tid, ...coords,
                    balance: 0, password: S.randomVaultPassword(8),
                    passwordUpdatedAt: Date.now(), wins: 0, losses: 0, agentRank: "trainee", icon: "🧑"
                });
                raw.teams = raw.teams || [];
                raw.teams.push(S.newTeamRecord({
                    id: tid, name: trimmed, ...coords, memberIds: [clientId]
                }));
                const newTeam = raw.teams[raw.teams.length - 1];
                S.ensureVaultCredentials(newTeam);
                S.syncTeamPasswordToMembers(raw, newTeam);
                pushActivity(raw, "player_join", `${trimmed} 创建队伍（${coords.state}）`);
            }
        }
        saveRoom(raw);
        sessionStorage.setItem(SK.roomRole, "player");
        return { ok: true, room: getRoom(room.id) };
    }

    function joinRoomAsSpectator(roomId, name) {
        const room = getRoom(roomId);
        if (!room) return { ok: false, error: "房间不存在。" };
        const raw = loadRooms()[room.id];
        const trimmed = (name || "").trim().slice(0, 24);
        if (!trimmed) return { ok: false, error: "请输入观战显示名称。" };
        if (!S.isValidParticipantName(trimmed)) return { ok: false, error: "名称不能为 unknown。" };
        const clientId = getClientId();
        raw.players = raw.players.filter(p => p.id !== clientId);
        if (raw.visitors) delete raw.visitors[clientId];
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
        return shuffleTeamGroups(roomId, randomStates);
    }

    function shuffleStatesOnly(roomId) {
        const raw = loadRooms()[(roomId || "").toUpperCase()];
        if (!raw) return { ok: false, error: "房间不存在。" };
        if (getClientId() !== raw.hostId) return { ok: false, error: "仅房主可重分州属。" };
        if (!raw.teams?.length) return { ok: false, error: "还没有队伍，请先 Shuffle 分队。" };
        S.ensureTeamsAndBank(raw);
        S.assignStatesToTeams(raw.teams);
        S.syncPlayersFromTeams(raw.players, raw.teams);
        raw.shuffleRandomStates = true;
        pushActivity(raw, "shuffle_states", `已随机重分 ${raw.teams.length} 支队伍的州属`);
        saveRoom(raw);
        return { ok: true, room: getRoom(raw.id) };
    }

    function shuffleTeamGroups(roomId, randomStates) {
        const raw = loadRooms()[(roomId || "").toUpperCase()];
        if (!raw) return { ok: false, error: "房间不存在。" };
        if (getClientId() !== raw.hostId) return { ok: false, error: "仅房主可 Shuffle。" };
        if (!raw.players.length) return { ok: false, error: "还没有玩家。" };
        S.ensureTeamsAndBank(raw);
        const shuffled = S.fisherYates(raw.players);
        const teams = [];
        const maxTeam = raw.settings?.maxTeamSize || 4;
        for (let i = 0; i < shuffled.length; i += maxTeam) {
            const chunk = shuffled.slice(i, i + maxTeam);
            const tid = S.createTeamId();
            const team = S.newTeamRecord({ id: tid, name: chunk[0]?.name || "队伍", memberIds: [] });
            chunk.forEach(p => {
                p.teamId = tid;
                team.memberIds.push(p.id);
            });
            teams.push(team);
        }
        if (randomStates) S.assignStatesToTeams(teams);
        else {
            teams.forEach((team, i) => {
                const lead = shuffled.find(p => p.id === team.memberIds[0]);
                if (lead?.stateId) {
                    team.stateId = lead.stateId;
                    team.state = lead.state;
                    team.mapX = lead.mapX;
                    team.mapY = lead.mapY;
                    team.lat = lead.lat;
                    team.lon = lead.lon;
                }
            });
        }
        raw.teams = teams;
        S.syncPlayersFromTeams(raw.players, raw.teams);
        raw.shuffleRandomStates = !!randomStates;
        pushActivity(raw, "shuffle_teams", randomStates
            ? `Shuffle：${teams.length} 支队伍已自动分队并分配州属`
            : `Shuffle：${teams.length} 支队伍已自动分队（4 人一组，末组可不足 4 人）`);
        saveRoom(raw);
        return { ok: true, room: getRoom(raw.id) };
    }

    function assignPlayerToTeam(roomId, playerId, teamId) {
        const raw = loadRooms()[(roomId || "").toUpperCase()];
        if (!raw) return { ok: false, error: "房间不存在。" };
        if (getClientId() !== raw.hostId) return { ok: false, error: "仅房主可调整分队。" };
        if (raw.status !== "lobby") return { ok: false, error: "比赛已开始。" };
        S.ensureTeamsAndBank(raw);
        const player = raw.players.find(p => p.id === playerId);
        if (!player) return { ok: false, error: "玩家不存在。" };
        const maxTeam = raw.settings?.maxTeamSize || 4;
        if (!teamId) {
            (raw.teams || []).forEach(t => {
                t.memberIds = (t.memberIds || []).filter(id => id !== playerId);
            });
            const tid = S.createTeamId();
            player.teamId = tid;
            raw.teams.push(S.newTeamRecord({
                id: tid, name: player.name,
                stateId: player.stateId, state: player.state,
                mapX: player.mapX, mapY: player.mapY, lat: player.lat, lon: player.lon,
                memberIds: [playerId]
            }));
            S.syncPlayersFromTeams(raw.players, raw.teams);
        } else {
            const team = raw.teams.find(t => t.id === teamId);
            if (!team) return { ok: false, error: "队伍不存在。" };
            if ((team.memberIds || []).length >= maxTeam && !(team.memberIds || []).includes(playerId)) {
                return { ok: false, error: "该队已满。" };
            }
            (raw.teams || []).forEach(t => {
                t.memberIds = (t.memberIds || []).filter(id => id !== playerId);
            });
            player.teamId = teamId;
            team.memberIds = team.memberIds || [];
            if (!team.memberIds.includes(playerId)) team.memberIds.push(playerId);
            S.syncPlayersFromTeams(raw.players, raw.teams);
        }
        pushActivity(raw, "team_assign", `房主调整分队：${player.name}`);
        saveRoom(raw);
        return { ok: true, room: getRoom(raw.id) };
    }

    function createTeam(roomId, stateId) {
        const raw = loadRooms()[(roomId || "").toUpperCase()];
        if (!raw) return { ok: false, error: "房间不存在。" };
        if (getClientId() !== raw.hostId) return { ok: false, error: "仅房主可新建队伍。" };
        if (raw.status !== "lobby") return { ok: false, error: "比赛已开始。" };
        if (raw.teams?.some(t => t.stateId === stateId)) {
            return { ok: false, error: "该州属已被占用。" };
        }
        const coords = S.coordsFromState(stateId);
        const tid = S.createTeamId();
        raw.teams = raw.teams || [];
        raw.teams.push(S.newTeamRecord({ id: tid, name: coords.state, ...coords, memberIds: [] }));
        saveRoom(raw);
        return { ok: true, room: getRoom(raw.id), teamId: tid };
    }

    function incrementTeamDeploy(raw, teamId, targetId) {
        if (!teamId || !targetId) return 0;
        raw.teamDeployCounts = raw.teamDeployCounts || {};
        const key = S.teamDeployKey(teamId, targetId);
        raw.teamDeployCounts[key] = (raw.teamDeployCounts[key] || 0) + 1;
        return raw.teamDeployCounts[key];
    }

    function getTeamDeployCountRoom(room, teamId, targetId) {
        return S.getTeamDeployCount(room, teamId, targetId);
    }

    function touchLobbyPresence(roomId) {
        const raw = loadRooms()[(roomId || "").toUpperCase()];
        if (!raw || raw.status !== "lobby") return { ok: true };
        const clientId = getClientId();
        const players = S.listFromMap(raw.players);
        const spectators = S.listFromMap(raw.spectators);
        if (players.some(p => p.id === clientId) || spectators.some(s => s.id === clientId)) {
            if (raw.visitors?.[clientId]) {
                delete raw.visitors[clientId];
                saveRoom(raw);
            }
            return { ok: true };
        }
        const last = raw.visitors?.[clientId]?.lastSeen || 0;
        if (Date.now() - last < 4000) return { ok: true };
        raw.visitors = raw.visitors || {};
        raw.visitors[clientId] = { id: clientId, lastSeen: Date.now() };
        saveRoom(raw);
        return { ok: true };
    }

    function startGame(roomId, force) {
        const raw = loadRooms()[(roomId || "").toUpperCase()];
        if (!raw) return { ok: false, error: "房间不存在。" };
        if (getClientId() !== raw.hostId) return { ok: false, error: "仅房主可开始游戏。" };
        const room = S.normalizeRoom(raw.id, raw);
        const lobbyCheck = S.validateLobbyForStart(room, getClientId());
        if (!lobbyCheck.ok) return lobbyCheck;
        if (!force && raw.players.length < 2) {
            return { ok: false, error: "至少需要 2 名玩家才能开始（真人互攻）。" };
        }
        if (raw.players.length < 1) return { ok: false, error: "还没有玩家。" };
        raw.launchCountdownAt = null;
        raw.status = "playing";
        raw.matchStartedAt = Date.now();
        raw.leaderboardLocked = raw.settings?.leaderboardLocked ?? (raw.mode === "competitive");
        S.ensureTeamsAndBank(raw);
        (raw.teams || []).forEach(t => {
            S.ensureVaultCredentials(t);
            S.syncTeamPasswordToMembers(raw, t);
        });
        raw.players.forEach(p => {
            p.balance = 0;
            p.missionProgress = S.freshMissionProgress();
            const team = (raw.teams || []).find(t => t.id === p.teamId);
            if (team) {
                p.password = team.password;
                p.passwordUpdatedAt = team.passwordUpdatedAt;
            }
        });
        raw.teamDeployCounts = {};
        raw.targetRaids = {};
        raw.bankBonus = S.defaultBankBonus();
        if (raw.bank) {
            raw.bank.balance = raw.settings?.bankInitialBalance ?? 50000;
            raw.bank.password = S.randomVaultPassword(8);
            raw.bank.passwordUpdatedAt = Date.now();
        }
        pushActivity(raw, "game_start", `比赛开始 · ${raw.mode === "practice" ? "练习" : "竞赛"}模式`);
        saveRoom(raw);
        return { ok: true, room: getRoom(raw.id) };
    }

    function beginLaunchCountdown(roomId) {
        const raw = loadRooms()[(roomId || "").toUpperCase()];
        if (!raw) return { ok: false, error: "房间不存在。" };
        if (getClientId() !== raw.hostId) return { ok: false, error: "仅房主可开始倒计时。" };
        if (raw.status !== "lobby") return { ok: false, error: "比赛已开始。" };
        raw.launchCountdownAt = Date.now();
        saveRoom(raw);
        return { ok: true, room: getRoom(raw.id) };
    }

    function cancelLaunchCountdown(roomId) {
        const raw = loadRooms()[(roomId || "").toUpperCase()];
        if (!raw) return { ok: false, error: "房间不存在。" };
        if (getClientId() !== raw.hostId) return { ok: false, error: "仅房主可取消开赛。" };
        raw.launchCountdownAt = null;
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
        if (!raw.settings.passwordRotateMs) {
            raw.settings.passwordRotateMs = S.defaultRoomSettings(raw.mode).passwordRotateMs;
        }
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

    function kickSpectator(roomId, spectatorId) {
        const raw = loadRooms()[(roomId || "").toUpperCase()];
        if (!raw) return { ok: false, error: "房间不存在。" };
        if (getClientId() !== raw.hostId) return { ok: false, error: "仅房主可踢人。" };
        const s = (raw.spectators || []).find(x => x.id === spectatorId);
        if (!s) return { ok: false, error: "观战者不在房间内。" };
        pushActivity(raw, "player_leave", `${s.name} 被房主移出观战`);
        raw.spectators = (raw.spectators || []).filter(x => x.id !== spectatorId);
        if (raw.visitors) raw.visitors[spectatorId] = { id: spectatorId, lastSeen: 0 };
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
        if (raw.visitors) delete raw.visitors[clientId];
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
        return { ok: true, room: getRoom(raw.id) };
    }

    function applyBreach(roomId, targetId) {
        const raw = loadRooms()[(roomId || "").toUpperCase()];
        if (!raw) return { ok: false, error: "房间不存在。" };
        if (raw.status !== "playing") return { ok: false, error: "比赛未进行中。" };
        const attackerId = getClientId();
        const attacker = raw.players.find(p => p.id === attackerId);
        if (!attacker) return { ok: false, error: "你不是本房玩家。" };
        if (targetId === S.BANK_TARGET_ID) {
            S.ensureTeamsAndBank(raw);
            pushActivity(raw, "vault_breach", `${attacker.name} 破解了央行金库`);
            saveRoom(raw);
            return { ok: true, room: getRoom(raw.id), attacker, target: raw.bank };
        }
        const target = raw.players.find(p => p.id === targetId);
        if (!target) return { ok: false, error: "目标不存在。" };
        if (attackerId === targetId) return { ok: false, error: "不能攻击自己。" };
        if (S.isSameTeam(S.normalizeRoom(raw.id, raw), attackerId, targetId)) {
            return { ok: false, error: "不能攻击队友。" };
        }
        pushActivity(raw, "vault_breach", `${attacker.name} 破解了 ${target.name} 的金库`);
        saveRoom(raw);
        return { ok: true, room: getRoom(raw.id), attacker, target };
    }

    function applyTransfer(roomId, targetId, opts) {
        const raw = loadRooms()[(roomId || "").toUpperCase()];
        if (!raw) return { ok: false, error: "房间不存在。" };
        if (raw.status !== "playing") return { ok: false, error: "比赛未进行中。" };
        const attackerId = getClientId();
        const attacker = raw.players.find(p => p.id === attackerId);
        if (!attacker) return { ok: false, error: "你不是本房玩家。" };
        if (S.isSameTeam(S.normalizeRoom(raw.id, raw), attackerId, targetId)) {
            return { ok: false, error: "不能攻击队友。" };
        }
        const target = raw.players.find(p => p.id === targetId);
        if (!target) return { ok: false, error: "目标不存在。" };
        if (attackerId === targetId) return { ok: false, error: "不能转给自己。" };
        if (!attacker.teamId || !target.teamId) {
            return { ok: false, error: "玩家尚未分队。" };
        }
        const vicTeam = raw.teams.find(t => t.id === target.teamId);
        const atkTeam = raw.teams.find(t => t.id === attacker.teamId);
        if (!vicTeam || !atkTeam) return { ok: false, error: "队伍数据异常。" };

        const mistakes = typeof opts === "object" && opts != null
            ? Math.max(0, Math.min(20, Number(opts.mistakes) || 0))
            : 0;
        const raidBefore = S.getTargetRaid(raw, vicTeam.id);
        const raidResult = S.completeTargetRaid(raw, vicTeam.id, attackerId, attacker.teamId, mistakes);
        const amt = raidResult.payout;
        if (amt <= 0) {
            saveRoom(raw);
            return {
                ok: false,
                error: mistakes >= 20
                    ? "失误满 20 次，本次攻坚无收益。"
                    : "攻坚奖池已空或份额为 0，本次无收益。"
            };
        }
        if (!S.debitTeamVault(raw, vicTeam.id, amt)) {
            return { ok: false, error: "目标队库余额不足。" };
        }
        S.creditTeamVault(raw, atkTeam.id, amt);
        S.rotateTeamVaultPassword(raw, vicTeam);
        S.recordPlayerEarnings(raw, attackerId, amt, "raid");
        raw.transactions = raw.transactions || [];
        raw.transactions.unshift({
            at: Date.now(), from: target.name, to: attacker.name,
            fromId: targetId, toId: attackerId,
            fromTeamId: vicTeam.id, toTeamId: atkTeam.id,
            amount: amt, kind: "pvp",
            raidPercent: raidResult.percent,
            raidMistakes: mistakes,
            raidShare: Math.round(raidResult.share)
        });
        if (raw.transactions.length > 50) raw.transactions.length = 50;
        const poolNote = raidBefore && raidBefore.lootPotTotal === raidBefore.lootPotRemaining
            ? ` · 攻坚池 ${raidResult.percent}%`
            : "";
        pushActivity(raw, "transfer",
            `${attacker.name} 攻坚 ${target.name}（${vicTeam.state || "队库"}）入账 RM ${amt.toLocaleString()}` +
            `${poolNote} · 失误 ${mistakes} · 剩余池 RM ${Math.round(raidResult.poolRemaining).toLocaleString()}`);
        saveRoom(raw);
        return {
            ok: true, room: getRoom(raw.id), attacker, target,
            victimTeam: vicTeam, attackerTeam: atkTeam, amount: amt, raid: raidResult
        };
    }

    function applyBankTransfer(roomId, amount) {
        const raw = loadRooms()[(roomId || "").toUpperCase()];
        if (!raw) return { ok: false, error: "房间不存在。" };
        if (raw.status !== "playing") return { ok: false, error: "比赛未进行中。" };
        S.ensureTeamsAndBank(raw);
        const attackerId = getClientId();
        const attacker = raw.players.find(p => p.id === attackerId);
        if (!attacker) return { ok: false, error: "你不是本房玩家。" };
        if (!attacker.teamId) return { ok: false, error: "你尚未加入队伍。" };
        const atkTeam = raw.teams.find(t => t.id === attacker.teamId);
        if (!atkTeam) return { ok: false, error: "队伍数据异常。" };
        const bank = raw.bank;
        if (!bank) return { ok: false, error: "央行不可用。" };
        const amt = Number(amount);
        if (!amt || amt <= 0) return { ok: false, error: "转账金额无效。" };
        if ((bank.balance || 0) < amt) return { ok: false, error: "央行金库余额不足。" };
        bank.balance = (bank.balance || 0) - amt;
        S.creditTeamVault(raw, atkTeam.id, amt);
        bank.password = S.randomVaultPassword(8);
        bank.passwordUpdatedAt = Date.now();
        S.recordPlayerEarnings(raw, attackerId, amt, "bonus");
        raw.transactions = raw.transactions || [];
        raw.transactions.unshift({
            at: Date.now(), from: bank.name, to: attacker.name,
            fromId: S.BANK_TARGET_ID, toId: attackerId,
            toTeamId: atkTeam.id, amount: amt, kind: "bank"
        });
        if (raw.transactions.length > 50) raw.transactions.length = 50;
        pushActivity(raw, "bank_transfer",
            `${attacker.name} 从央行提取 RM ${amt.toLocaleString()} → ${atkTeam.state || "队库"}`);
        saveRoom(raw);
        return { ok: true, room: getRoom(raw.id), attacker, attackerTeam: atkTeam, bank, amount: amt };
    }

    function beginBankBonus(roomId, waveIndex) {
        const raw = loadRooms()[(roomId || "").toUpperCase()];
        if (!raw) return { ok: false, error: "房间不存在。" };
        if (raw.status !== "playing") return { ok: false, error: "比赛未进行中。" };
        S.ensureTeamsAndBank(raw);
        const wi = Number(waveIndex);
        if (!Number.isFinite(wi) || wi < 0) return { ok: false, error: "无效波次。" };
        const attackerId = getClientId();
        const attacker = raw.players.find(p => p.id === attackerId);
        if (!attacker) return { ok: false, error: "你不是本房玩家。" };
        if (!attacker.teamId) return { ok: false, error: "你尚未加入队伍。" };
        const wave = S.ensureBonusWavePool(raw, wi);
        const attemptKey = S.bankBonusAttemptKey(wi, attackerId);
        const bonus = S.ensureBankBonus(raw);
        const existing = bonus.attempts[attemptKey];
        if (existing?.paid) {
            saveRoom(raw);
            return {
                ok: true,
                practiceOnly: true,
                pool: wave.pool,
                waveIndex: wi,
                briefingSeed: `${raw.id}|${wi}|${attackerId}|practice`,
                startedAt: Date.now()
            };
        }
        const startedAt = Date.now();
        bonus.attempts[attemptKey] = {
            paid: true,
            startedAt,
            practiceOnly: false,
            completed: false,
            wrongCount: 0
        };
        saveRoom(raw);
        return {
            ok: true,
            practiceOnly: false,
            pool: wave.pool,
            waveIndex: wi,
            briefingSeed: `${raw.id}|${wi}|${attackerId}`,
            startedAt
        };
    }

    function completeBankBonus(roomId, waveIndex, payload) {
        const raw = loadRooms()[(roomId || "").toUpperCase()];
        if (!raw) return { ok: false, error: "房间不存在。" };
        if (raw.status !== "playing") return { ok: false, error: "比赛未进行中。" };
        S.ensureTeamsAndBank(raw);
        const wi = Number(waveIndex);
        const attackerId = getClientId();
        const attacker = raw.players.find(p => p.id === attackerId);
        if (!attacker?.teamId) return { ok: false, error: "你尚未加入队伍。" };
        const atkTeam = raw.teams.find(t => t.id === attacker.teamId);
        if (!atkTeam) return { ok: false, error: "队伍数据异常。" };
        const bank = raw.bank;
        if (!bank) return { ok: false, error: "央行不可用。" };
        const bonus = S.ensureBankBonus(raw);
        const attemptKey = S.bankBonusAttemptKey(wi, attackerId);
        const attempt = bonus.attempts[attemptKey];
        if (!attempt || attempt.practiceOnly) {
            return { ok: false, error: "练习模式无奖金。", practiceOnly: true };
        }
        if (attempt.completed) return { ok: false, error: "本波已结算。" };
        const wave = bonus.waves[String(wi)];
        if (!wave?.pool) return { ok: false, error: "奖池数据异常。" };
        const wrongCount = Math.max(0, Number(payload?.wrongCount) || 0);
        const startedAt = Number(payload?.startedAt) || attempt.startedAt || Date.now();
        const amt = S.computeBonusPayout(wave.pool, startedAt, Date.now(), wrongCount);
        if (!amt || amt <= 0) return { ok: false, error: "奖金已扣尽。" };
        if ((bank.balance || 0) < amt) return { ok: false, error: "央行金库余额不足。" };
        bank.balance = (bank.balance || 0) - amt;
        S.creditTeamVault(raw, atkTeam.id, amt);
        S.recordPlayerEarnings(raw, attackerId, amt, "bonus");
        attempt.completed = true;
        attempt.amount = amt;
        attempt.wrongCount = wrongCount;
        attempt.finishedAt = Date.now();
        bonus.completions.push({
            waveIndex: wi,
            playerId: attackerId,
            teamId: atkTeam.id,
            amount: amt,
            wrongCount,
            at: Date.now()
        });
        raw.transactions = raw.transactions || [];
        raw.transactions.unshift({
            at: Date.now(),
            from: bank.name,
            to: attacker.name,
            fromId: S.BANK_TARGET_ID,
            toId: attackerId,
            toTeamId: atkTeam.id,
            amount: amt,
            kind: "bank_bonus"
        });
        if (raw.transactions.length > 50) raw.transactions.length = 50;
        pushActivity(raw, "bank_bonus_complete",
            `${attacker.name} 阅读情报 Bonus +RM ${amt.toLocaleString()} → ${atkTeam.state || "队库"}`);
        saveRoom(raw);
        return {
            ok: true,
            room: getRoom(raw.id),
            attacker,
            attackerTeam: atkTeam,
            bank,
            amount: amt,
            pool: wave.pool,
            wrongCount
        };
    }

    function claimTeamDeploy(roomId, targetId) {
        const raw = loadRooms()[(roomId || "").toUpperCase()];
        if (!raw) return { ok: false, error: "房间不存在。" };
        const clientId = getClientId();
        const room = getRoom(raw.id);
        const me = room.players.find(p => p.id === clientId);
        if (!me?.teamId) return { ok: false, error: "你尚未加入队伍。" };
        const max = getMaxDeployPerTarget(roomId);
        const used = S.getTeamDeployCount(room, me.teamId, targetId);
        if (used >= max) {
            return { ok: false, error: `本队对该目标的部署次数已用完（${used}/${max === 999 ? "∞" : max}）。` };
        }
        const seq = incrementTeamDeploy(raw, me.teamId, targetId);
        const targetPlayer = raw.players.find(p => p.id === targetId);
        if (targetPlayer?.teamId) {
            const raidBefore = S.getTargetRaid(raw, targetPlayer.teamId);
            const isNewPool = !raidBefore || S.shouldStartNewRaid(raidBefore);
            S.joinTargetRaid(raw, targetPlayer.teamId, clientId, me.teamId);
            if (isNewPool) {
                const raid = S.getTargetRaid(raw, targetPlayer.teamId);
                const vicTeam = raw.teams.find(t => t.id === targetPlayer.teamId);
                pushActivity(raw, "raid_pool",
                    `集体攻坚开启：${vicTeam?.state || targetPlayer.name} 奖池 P=${raid?.percent}% · RM ${(raid?.lootPotTotal || 0).toLocaleString()}`);
            }
        }
        saveRoom(raw);
        return { ok: true, room: getRoom(raw.id), deploySeq: seq };
    }

    function updatePlayerInRoom(roomId, patch) {
        const raw = loadRooms()[(roomId || "").toUpperCase()];
        if (!raw) return { ok: false, error: "房间不存在。" };
        S.ensureTeamsAndBank(raw);
        const p = raw.players.find(x => x.id === getClientId());
        if (!p) return { ok: false, error: "你不是本房玩家。" };
        Object.assign(p, patch);
        delete p.balance;
        p.balance = 0;
        if (patch.password && p.teamId) {
            const team = raw.teams.find(t => t.id === p.teamId);
            if (team) {
                team.password = patch.password;
                team.passwordUpdatedAt = patch.passwordUpdatedAt || Date.now();
                S.syncTeamPasswordToMembers(raw, team);
            }
        }
        if (patch.balance != null) delete patch.balance;
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
        SK, getClientId, createRoom, getRoom, saveRoom, joinRoom, reconnectRoom, ensureRoom,
        joinRoomAsPlayer, joinRoomAsSpectator, setRoomMode, shufflePlayers, shuffleStatesOnly, shuffleTeamGroups,
        assignPlayerToTeam, createTeam, getTeamDeployCountRoom, setRoomJoinPassword,
        startGame, endGame, beginLaunchCountdown, cancelLaunchCountdown,
        kickPlayer, kickSpectator, leaveRoom, getSessionRoom, getSessionRole,
        isHost, canWrite, pushActivity: (r, t, m) => pushActivity(r, t, m),
        coordsFromState: S.coordsFromState, updatePlayerInRoom, updatePlayerProgress,
        getRoomSettings, logActivity, applyBreach, applyTransfer, applyBankTransfer,
        beginBankBonus, completeBankBonus, getMaxDeployPerTarget,
        claimTargetDeploy, claimTeamDeploy, subscribe, exportRoomCsv, exportRoomReport,
        setMatchDuration, autoEndGameIfExpired, touchLobbyPresence,
        backendName: "local",
        getConnectionStatus: () => ({ status: "local", url: "" }),
        onConnectionChange: () => () => {},
    };
})();
