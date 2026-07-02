/**
 * Server-side room RPC — ported from js/room-local.js with RoomStore persistence.
 */
const { S } = require("../lib/load-shared");
const { withRoomLock, archiveEndedRoom } = require("../db");
const JT = require("../lib/join-token");

function createRoomHandlers(store) {
    const SK = S.SK;

    function getRaw(roomId) {
        const id = (roomId || "").toUpperCase();
        if (!id) return null;
        let raw = store.getRaw(id);
        if (!raw) return null;
        S.ensureRoomLists(raw);
        return raw;
    }

    function getRoom(roomId) {
        const raw = getRaw(roomId);
        if (!raw) return null;
        return S.normalizeRoom(raw.id, JT.stripJoinSecrets(raw));
    }

    function persist(raw) {
        S.ensureRoomLists(raw);
        store.save(raw);
        return getRoom(raw.id);
    }

    function pushActivity(raw, type, message, clientId) {
        S.ensureRoomLists(raw);
        raw.activity.unshift({ at: Date.now(), type, message, clientId });
        if (raw.activity.length > 100) raw.activity.length = 100;
    }

    function generateRoomCode() {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        let code = "";
        for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
        if (store.exists(code)) return generateRoomCode();
        return code;
    }

    function getPlayerInRoom(room, playerId) {
        return room.players.find(p => p.id === playerId) || null;
    }

    function incrementTeamDeploy(raw, teamId, targetId) {
        if (!teamId || !targetId) return 0;
        raw.teamDeployCounts = raw.teamDeployCounts || {};
        const key = S.teamDeployKey(teamId, targetId);
        raw.teamDeployCounts[key] = (raw.teamDeployCounts[key] || 0) + 1;
        return raw.teamDeployCounts[key];
    }

    function handlers(clientId) {
        const cid = () => clientId;

        return {
            createRoom(requestedId) {
                const id = (requestedId || "").trim().toUpperCase() || generateRoomCode();
                if (store.exists(id)) return getRoom(id);
                const hostId = cid();
                const room = {
                    id, hostId, mode: "practice", status: "lobby", shuffleRandomStates: false,
                    joinPasswordEnabled: false, joinPassword: "",
                    players: [], spectators: [], teams: [], activity: [], transactions: [],
                    deployLocks: {}, teamDeployCounts: {}, targetRaids: {}, bankBonus: null,
                    bank: S.defaultBank(),
                    settings: S.defaultRoomSettings("practice"), createdAt: Date.now()
                };
                S.ensureVaultCredentials(room.bank);
                pushActivity(room, "room_created", `房间 ${id} 已创建`, hostId);
                persist(room);
                return getRoom(id);
            },

            saveRoom(room) {
                if (!room?.id) return null;
                persist(room);
                return getRoom(room.id);
            },

            reconnectRoom(roomId, password) {
                const id = (roomId || "").toUpperCase();
                if (!id) return { ok: false, error: "无房间记录。" };
                return handlers(clientId).joinRoom(id, password);
            },

            ensureRoom(roomId, opts) {
                const id = (roomId || "").toUpperCase();
                if (!id) return { ok: false, error: "无房间码。" };
                const existing = getRoom(id);
                if (existing) {
                    if (existing.status === "ended") return { ok: false, error: "房间已结束。" };
                    handlers(clientId).touchLobbyPresence(id);
                    return { ok: true, room: existing };
                }
                if (!(opts && opts.adoptIfMissing)) {
                    return { ok: false, error: "找不到房间，请从主页创建或加入。" };
                }
                const room = handlers(clientId).createRoom(id);
                return { ok: true, room, created: true };
            },

            joinRoom(roomId, password) {
                const raw = getRaw(roomId);
                if (!raw) return { ok: false, error: "找不到房间，请检查房间码。" };
                if (raw.status === "ended") return { ok: false, error: "房间已结束。" };
                const clientId = cid();
                if (JT.needsJoinToken(raw, clientId) && !JT.verifyJoinToken(raw, password)) {
                    return { ok: false, error: "进房令牌不正确。", needsPassword: true };
                }
                handlers(clientId).touchLobbyPresence(raw.id);
                return { ok: true, room: getRoom(raw.id) };
            },

            setRoomJoinPassword(roomId, enabled, password) {
                const raw = getRaw(roomId);
                if (!raw) return { ok: false, error: "房间不存在。" };
                if (cid() !== raw.hostId) return { ok: false, error: "仅房主可设置进房令牌。" };
                if (raw.status !== "lobby") return { ok: false, error: "比赛已开始，无法修改进房令牌。" };
                raw.joinPasswordEnabled = !!enabled;
                let joinToken = null;
                if (raw.joinPasswordEnabled) {
                    let token = JT.normalizeJoinToken(password);
                    if (!token) token = JT.generateJoinToken();
                    raw.joinTokenHash = JT.hashJoinToken(token);
                    delete raw.joinPassword;
                    joinToken = token;
                    pushActivity(raw, "room_password", "房主已开启进房令牌", cid());
                } else {
                    raw.joinTokenHash = "";
                    delete raw.joinPassword;
                    pushActivity(raw, "room_password", "房主已关闭进房令牌", cid());
                }
                persist(raw);
                const res = { ok: true, room: getRoom(raw.id) };
                if (joinToken) res.joinToken = joinToken;
                return res;
            },

            joinRoomAsPlayer(roomId, name, stateId, teamId) {
                const raw = getRaw(roomId);
                if (!raw) return { ok: false, error: "房间不存在。" };
                if (raw.status !== "lobby") return { ok: false, error: "游戏已开始，无法以玩家加入。" };
                const trimmed = (name || "").trim().slice(0, 24);
                if (!trimmed) return { ok: false, error: "请输入显示名称。" };
                if (!S.isValidParticipantName(trimmed)) return { ok: false, error: "名称不能为 unknown。" };
                S.ensureTeamsAndBank(raw);
                const clientId = cid();
                raw.spectators = (raw.spectators || []).filter(s => s.id !== clientId);
                if (raw.visitors) delete raw.visitors[clientId];
                const existing = raw.players.find(p => p.id === clientId);
                teamId = S.resolveJoinTeamId(teamId, raw.teams);

                if (teamId) {
                    const joinTeam = S.joinPlayerToTeamId(raw, clientId, teamId, trimmed, existing);
                    if (!joinTeam.ok) return joinTeam;
                    if (!existing) {
                        pushActivity(raw, "player_join", `${trimmed} 加入 ${joinTeam.team.state || "队伍"}`, clientId);
                    }
                } else {
                    const joinRes = S.joinPlayerToState(raw, clientId, stateId, trimmed, existing);
                    if (!joinRes.ok) return joinRes;
                    if (!existing) {
                        const team = joinRes.team;
                        raw.players.push({
                            id: clientId, name: trimmed, teamId: team.id, ...S.coordsFromState(stateId),
                            balance: 0, password: S.randomVaultPassword(8),
                            passwordUpdatedAt: Date.now(), wins: 0, losses: 0, agentRank: "trainee", icon: "🧑"
                        });
                        S.syncPlayersFromTeams(raw.players, raw.teams);
                        S.syncTeamPasswordToMembers(raw, team);
                        pushActivity(raw, "player_join", `${trimmed} 创建队伍（${team.state}）`, clientId);
                    } else {
                        pushActivity(raw, "player_join", `${trimmed} 进驻 ${joinRes.team.state || stateId}`, clientId);
                    }
                }
                persist(raw);
                return { ok: true, room: getRoom(raw.id), role: "player" };
            },

            joinRoomAsSpectator(roomId, name) {
                const raw = getRaw(roomId);
                if (!raw) return { ok: false, error: "房间不存在。" };
                const trimmed = (name || "").trim().slice(0, 24);
                if (!trimmed) return { ok: false, error: "请输入观战显示名称。" };
                if (!S.isValidParticipantName(trimmed)) return { ok: false, error: "名称不能为 unknown。" };
                const clientId = cid();
                S.removePlayerFromTeamLists(raw, clientId);
                S.removePlayerFromAllRaids(raw, clientId);
                raw.players = raw.players.filter(p => p.id !== clientId);
                if (raw.visitors) delete raw.visitors[clientId];
                let existing = (raw.spectators || []).find(s => s.id === clientId);
                if (existing) existing.name = trimmed;
                else {
                    raw.spectators = raw.spectators || [];
                    raw.spectators.push({ id: clientId, name: trimmed });
                    pushActivity(raw, "spectator_join", `${trimmed} 以观战身份加入`, clientId);
                }
                persist(raw);
                return { ok: true, room: getRoom(raw.id), role: "spectator" };
            },

            confirmLobbyName(roomId, name) {
                const raw = getRaw(roomId);
                if (!raw) return { ok: false, error: "房间不存在。" };
                if (raw.status !== "lobby") return { ok: false, error: "比赛已开始。" };
                const trimmed = (name || "").trim().slice(0, 24);
                if (!trimmed) return { ok: false, error: "请输入显示名称。" };
                if (!S.isValidParticipantName(trimmed)) return { ok: false, error: "名称不能为 unknown。" };
                const clientId = cid();
                const player = raw.players.find(p => p.id === clientId);
                if (player) {
                    player.name = trimmed;
                    persist(raw);
                    return { ok: true, room: getRoom(raw.id) };
                }
                const spec = (raw.spectators || []).find(s => s.id === clientId);
                if (spec) {
                    spec.name = trimmed;
                    persist(raw);
                    return { ok: true, room: getRoom(raw.id) };
                }
                raw.visitors = raw.visitors || {};
                raw.visitors[clientId] = {
                    id: clientId,
                    lastSeen: Date.now(),
                    name: trimmed
                };
                persist(raw);
                return { ok: true, room: getRoom(raw.id) };
            },

            leaveTeamToBench(roomId, name) {
                const raw = getRaw(roomId);
                if (!raw) return { ok: false, error: "房间不存在。" };
                const clientId = cid();
                const player = raw.players.find(p => p.id === clientId);
                if (!player) return { ok: false, error: "你尚未加入队伍。" };
                const benchName = (name || player.name || "").trim().slice(0, 24);
                if (!benchName) return { ok: false, error: "请先确认显示名称。" };
                return handlers(clientId).joinRoomAsSpectator(roomId, benchName);
            },

            setRoomMode(roomId, mode) {
                const raw = getRaw(roomId);
                if (!raw) return { ok: false, error: "房间不存在。" };
                if (cid() !== raw.hostId) return { ok: false, error: "仅房主可更改模式。" };
                raw.mode = mode === "competitive" ? "competitive" : "practice";
                raw.settings = S.defaultRoomSettings(raw.mode);
                pushActivity(raw, "mode_change", `模式改为 ${raw.mode === "practice" ? "练习" : "竞赛"}`, cid());
                persist(raw);
                return { ok: true, room: getRoom(raw.id) };
            },

            shufflePlayers(roomId, randomStates) {
                return handlers(clientId).shuffleTeamGroups(roomId, randomStates);
            },

            shuffleStatesOnly(roomId) {
                const raw = getRaw(roomId);
                if (!raw) return { ok: false, error: "房间不存在。" };
                if (cid() !== raw.hostId) return { ok: false, error: "仅房主可重分州属。" };
                if (!raw.teams?.length) return { ok: false, error: "还没有队伍，请先 Shuffle 分队。" };
                S.ensureTeamsAndBank(raw);
                S.assignStatesToTeams(raw.teams);
                S.syncPlayersFromTeams(raw.players, raw.teams);
                raw.shuffleRandomStates = true;
                pushActivity(raw, "shuffle_states", `已随机重分 ${raw.teams.length} 支队伍的州属`, cid());
                persist(raw);
                return { ok: true, room: getRoom(raw.id) };
            },

            shuffleTeamGroups(roomId, randomStates) {
                const raw = getRaw(roomId);
                if (!raw) return { ok: false, error: "房间不存在。" };
                if (cid() !== raw.hostId) return { ok: false, error: "仅房主可 Shuffle。" };
                if (!raw.players.length) return { ok: false, error: "还没有玩家。" };
                S.ensureTeamsAndBank(raw);
                const stats = S.shufflePlayersIntoTeams(raw, randomStates);
                pushActivity(raw, "shuffle_teams", randomStates
                    ? `Shuffle：${stats.teamCount} 支队伍 · 均 ${stats.avgTeamSize} 人/队 · 已分配州属`
                    : `Shuffle：${stats.teamCount} 支队伍 · 均 ${stats.avgTeamSize} 人/队（上限 ${stats.maxTeamSize} 人）`, cid());
                persist(raw);
                return { ok: true, room: getRoom(raw.id), shuffleStats: stats };
            },

            setRoomMaxTeamSize(roomId, size) {
                const raw = getRaw(roomId);
                if (!raw) return { ok: false, error: "房间不存在。" };
                if (cid() !== raw.hostId) return { ok: false, error: "仅房主可设置。" };
                if (raw.status !== "lobby") return { ok: false, error: "比赛已开始。" };
                const max = S.parseMaxTeamSize(size);
                if (max == null) return { ok: false, error: "每队人数须在 2～6 之间。" };
                raw.settings = raw.settings || S.defaultRoomSettings(raw.mode);
                raw.settings.maxTeamSize = max;
                pushActivity(raw, "settings", `每队人数上限改为 ${max} 人`, cid());
                persist(raw);
                return { ok: true, room: getRoom(raw.id), maxTeamSize: max };
            },

            setRoomMapEffects(roomId, enabled) {
                const raw = getRaw(roomId);
                if (!raw) return { ok: false, error: "房间不存在。" };
                if (cid() !== raw.hostId) return { ok: false, error: "仅房主可设置。" };
                if (raw.status !== "lobby") return { ok: false, error: "比赛已开始。" };
                raw.settings = raw.settings || S.defaultRoomSettings(raw.mode);
                raw.settings.mapEffects = !!enabled;
                pushActivity(raw, "settings", enabled ? "已开启地图攻击线特效" : "已关闭地图攻击线特效", cid());
                persist(raw);
                return { ok: true, room: getRoom(raw.id), mapEffects: !!enabled };
            },

            abandonTargetRaid(roomId) {
                const raw = getRaw(roomId);
                if (!raw) return { ok: false, error: "房间不存在。" };
                S.removePlayerFromAllRaids(raw, cid());
                persist(raw);
                return { ok: true, room: getRoom(raw.id) };
            },

            assignPlayerToTeam(roomId, playerId, teamId) {
                const raw = getRaw(roomId);
                if (!raw) return { ok: false, error: "房间不存在。" };
                if (cid() !== raw.hostId) return { ok: false, error: "仅房主可调整分队。" };
                if (raw.status !== "lobby") return { ok: false, error: "比赛已开始。" };
                S.ensureTeamsAndBank(raw);
                const player = raw.players.find(p => p.id === playerId);
                if (!player) return { ok: false, error: "玩家不存在。" };
                if (!teamId) {
                    player.teamId = S.createTeamId();
                    raw.teams.push(S.newTeamRecord({
                        id: player.teamId, name: player.name,
                        stateId: player.stateId, state: player.state,
                        mapX: player.mapX, mapY: player.mapY, lat: player.lat, lon: player.lon,
                        memberIds: [playerId]
                    }));
                    S.reconcileLobbyTeams(raw);
                } else {
                    const joinTeam = S.joinPlayerToTeamId(raw, playerId, teamId, player.name, player);
                    if (!joinTeam.ok) return joinTeam;
                }
                pushActivity(raw, "team_assign", `房主调整分队：${player.name}`, cid());
                persist(raw);
                return { ok: true, room: getRoom(raw.id) };
            },

            createTeam(roomId, stateId) {
                const raw = getRaw(roomId);
                if (!raw) return { ok: false, error: "房间不存在。" };
                if (cid() !== raw.hostId) return { ok: false, error: "仅房主可新建队伍。" };
                if (raw.status !== "lobby") return { ok: false, error: "比赛已开始。" };
                if (raw.teams?.some(t => t.stateId === stateId)) {
                    return { ok: false, error: "该州属已被其他队伍选择。" };
                }
                const coords = S.coordsFromState(stateId);
                const tid = S.createTeamId();
                raw.teams = raw.teams || [];
                raw.teams.push(S.newTeamRecord({ id: tid, name: coords.state, ...coords, memberIds: [] }));
                persist(raw);
                return { ok: true, room: getRoom(raw.id), teamId: tid };
            },

            touchLobbyPresence(roomId) {
                const raw = getRaw(roomId);
                if (!raw || raw.status !== "lobby") return { ok: true };
                const clientId = cid();
                const players = raw.players || [];
                const spectators = raw.spectators || [];
                if (players.some(p => p.id === clientId) || spectators.some(s => s.id === clientId)) {
                    if (raw.visitors?.[clientId]) {
                        delete raw.visitors[clientId];
                        persist(raw);
                    }
                    return { ok: true };
                }
                const last = raw.visitors?.[clientId]?.lastSeen || 0;
                if (Date.now() - last < 4000) return { ok: true };
                const room = S.normalizeRoom(raw.id, raw);
                const suggested = S.suggestLobbyName(room, clientId);
                raw.visitors = raw.visitors || {};
                const prev = raw.visitors[clientId];
                raw.visitors[clientId] = {
                    id: clientId,
                    lastSeen: Date.now(),
                    name: prev?.name || suggested
                };
                raw.lastActivityAt = Date.now();
                persist(raw);
                return { ok: true };
            },

            startGame(roomId, force) {
                const raw = getRaw(roomId);
                if (!raw) return { ok: false, error: "房间不存在。" };
                if (cid() !== raw.hostId) return { ok: false, error: "仅房主可开始游戏。" };
                const room = S.normalizeRoom(raw.id, raw);
                const lobbyCheck = S.validateLobbyForStart(room, cid());
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
                S.refreshTeamCoordsFromStates(raw.teams);
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
                pushActivity(raw, "game_start", `比赛开始 · ${raw.mode === "practice" ? "练习" : "竞赛"}模式`, cid());
                persist(raw);
                return { ok: true, room: getRoom(raw.id) };
            },

            beginLaunchCountdown(roomId) {
                const raw = getRaw(roomId);
                if (!raw) return { ok: false, error: "房间不存在。" };
                if (cid() !== raw.hostId) return { ok: false, error: "仅房主可开始倒计时。" };
                if (raw.status !== "lobby") return { ok: false, error: "比赛已开始。" };
                raw.launchCountdownAt = Date.now();
                persist(raw);
                return { ok: true, room: getRoom(raw.id) };
            },

            cancelLaunchCountdown(roomId) {
                const raw = getRaw(roomId);
                if (!raw) return { ok: false, error: "房间不存在。" };
                if (cid() !== raw.hostId) return { ok: false, error: "仅房主可取消开赛。" };
                raw.launchCountdownAt = null;
                persist(raw);
                return { ok: true, room: getRoom(raw.id) };
            },

            setMatchDuration(roomId, minutes) {
                const raw = getRaw(roomId);
                if (!raw) return { ok: false, error: "房间不存在。" };
                if (cid() !== raw.hostId) return { ok: false, error: "仅房主可设置。" };
                if (raw.status !== "lobby") return { ok: false, error: "比赛已开始，无法修改时长。" };
                const m = S.parseMatchMinutes(minutes);
                if (m == null) return { ok: false, error: "请输入至少 1 分钟的有效数字。" };
                raw.settings = raw.settings || S.defaultRoomSettings(raw.mode);
                if (!raw.settings.passwordRotateMs) {
                    raw.settings.passwordRotateMs = S.defaultRoomSettings(raw.mode).passwordRotateMs;
                }
                raw.settings.roundMs = m * 60 * 1000;
                persist(raw);
                return { ok: true, room: getRoom(raw.id) };
            },

            autoEndGameIfExpired(roomId) {
                const raw = getRaw(roomId);
                if (!raw || raw.status !== "playing") return { ok: false };
                const remaining = S.getMatchRemainingMs(S.normalizeRoom(raw.id, raw));
                if (remaining == null || remaining > 0) return { ok: false };
                if (raw.status === "ended") return { ok: true, room: getRoom(raw.id) };
                raw.status = "ended";
                raw.endedAt = Date.now();
                pushActivity(raw, "game_end", "比赛时间到，自动结束", cid());
                persist(raw);
                archiveEndedRoom(raw);
                return { ok: true, room: getRoom(raw.id) };
            },

            endGame(roomId) {
                const raw = getRaw(roomId);
                if (!raw) return { ok: false, error: "房间不存在。" };
                if (cid() !== raw.hostId) return { ok: false, error: "仅房主可结束比赛。" };
                raw.status = "ended";
                raw.endedAt = Date.now();
                pushActivity(raw, "game_end", "房主结束比赛", cid());
                persist(raw);
                archiveEndedRoom(raw);
                return { ok: true, room: getRoom(raw.id) };
            },

            kickPlayer(roomId, playerId) {
                const raw = getRaw(roomId);
                if (!raw) return { ok: false, error: "房间不存在。" };
                if (cid() !== raw.hostId) return { ok: false, error: "仅房主可踢人。" };
                const p = raw.players.find(x => x.id === playerId);
                if (!p) return { ok: false, error: "玩家不在房间内。" };
                if (playerId === raw.hostId) return { ok: false, error: "不能踢出房主。" };
                pushActivity(raw, "player_leave", `${p.name} 被房主移出房间`, cid());
                S.removePlayerFromTeamLists(raw, playerId);
                S.removePlayerFromAllRaids(raw, playerId);
                raw.players = raw.players.filter(x => x.id !== playerId);
                persist(raw);
                return { ok: true, room: getRoom(raw.id) };
            },

            kickSpectator(roomId, spectatorId) {
                const raw = getRaw(roomId);
                if (!raw) return { ok: false, error: "房间不存在。" };
                if (cid() !== raw.hostId) return { ok: false, error: "仅房主可踢人。" };
                const s = (raw.spectators || []).find(x => x.id === spectatorId);
                if (!s) return { ok: false, error: "观战者不在房间内。" };
                pushActivity(raw, "player_leave", `${s.name} 被房主移出观战`, cid());
                raw.spectators = (raw.spectators || []).filter(x => x.id !== spectatorId);
                if (raw.visitors) raw.visitors[spectatorId] = { id: spectatorId, lastSeen: 0 };
                persist(raw);
                return { ok: true, room: getRoom(raw.id) };
            },

            leaveRoom(roomId) {
                const raw = getRaw(roomId);
                if (!raw) return { ok: true };
                const clientId = cid();
                const p = raw.players.find(x => x.id === clientId);
                if (p) {
                    pushActivity(raw, "player_leave", `${p.name} 离开房间`, clientId);
                    S.removePlayerFromTeamLists(raw, clientId);
                    S.removePlayerFromAllRaids(raw, clientId);
                }
                raw.players = raw.players.filter(x => x.id !== clientId);
                raw.spectators = (raw.spectators || []).filter(x => x.id !== clientId);
                if (raw.visitors) delete raw.visitors[clientId];
                if (raw.hostId === clientId && raw.players[0]) raw.hostId = raw.players[0].id;
                persist(raw);
                return { ok: true };
            },

            logActivity(roomId, type, message) {
                const raw = getRaw(roomId);
                if (!raw) return { ok: false, error: "房间不存在。" };
                pushActivity(raw, type, message, cid());
                persist(raw);
                return { ok: true, room: getRoom(raw.id) };
            },

            claimTargetDeploy(roomId, targetId) {
                const raw = getRaw(roomId);
                if (!raw) return { ok: false, error: "房间不存在。" };
                if (!getPlayerInRoom(getRoom(raw.id), cid())) {
                    return { ok: false, error: "仅玩家可部署任务。" };
                }
                return { ok: true, room: getRoom(raw.id) };
            },

            claimTeamDeploy(roomId, targetId) {
                const raw = getRaw(roomId);
                if (!raw) return { ok: false, error: "房间不存在。" };
                const clientId = cid();
                const room = getRoom(raw.id);
                const me = room.players.find(p => p.id === clientId);
                if (!me?.teamId) return { ok: false, error: "你尚未加入队伍。" };
                const max = room.settings?.maxDeployPerTarget ?? 99;
                const used = S.getTeamDeployCount(room, me.teamId, targetId);
                if (used >= max) {
                    return { ok: false, error: `本队对该目标的部署次数已用完（${used}/${max === 999 ? "∞" : max}）。` };
                }
                const seq = incrementTeamDeploy(raw, me.teamId, targetId);
                const targetPlayer = raw.players.find(p => p.id === targetId);
                if (targetPlayer?.teamId) {
                    const raidBefore = S.getTargetRaid(raw, targetPlayer.teamId);
                    const isNewRaid = !raidBefore;
                    S.joinTargetRaid(raw, targetPlayer.teamId, clientId, me.teamId);
                    if (isNewRaid) {
                        const vicTeam = raw.teams.find(t => t.id === targetPlayer.teamId);
                        pushActivity(raw, "raid_pool",
                            `开始攻坚：${vicTeam?.state || targetPlayer.name} · 名义 RM ${S.RAID_BASE_PAYOUT}`,
                            clientId);
                    }
                }
                persist(raw);
                const raid = targetPlayer?.teamId
                    ? S.raidSnapshot(S.getTargetRaid(raw, targetPlayer.teamId))
                    : null;
                return { ok: true, room: getRoom(raw.id), deploySeq: seq, raid };
            },

            applyBreach(roomId, targetId) {
                const raw = getRaw(roomId);
                if (!raw) return { ok: false, error: "房间不存在。" };
                if (raw.status !== "playing") return { ok: false, error: "比赛未进行中。" };
                const attackerId = cid();
                const attacker = raw.players.find(p => p.id === attackerId);
                if (!attacker) return { ok: false, error: "你不是本房玩家。" };
                if (targetId === S.BANK_TARGET_ID) {
                    S.ensureTeamsAndBank(raw);
                    pushActivity(raw, "vault_breach", `${attacker.name} 破解了央行金库`, attackerId);
                    persist(raw);
                    return { ok: true, room: getRoom(raw.id), attacker, target: raw.bank };
                }
                const target = raw.players.find(p => p.id === targetId);
                if (!target) return { ok: false, error: "目标不存在。" };
                if (attackerId === targetId) return { ok: false, error: "不能攻击自己。" };
                if (S.isSameTeam(S.normalizeRoom(raw.id, raw), attackerId, targetId)) {
                    return { ok: false, error: "不能攻击队友。" };
                }
                pushActivity(raw, "vault_breach", `${attacker.name} 破解了 ${target.name} 的金库`, attackerId);
                persist(raw);
                return { ok: true, room: getRoom(raw.id), attacker, target };
            },

            applyTransfer(roomId, targetId, opts) {
                const raw = getRaw(roomId);
                if (!raw) return { ok: false, error: "房间不存在。" };
                if (raw.status !== "playing") return { ok: false, error: "比赛未进行中。" };
                const attackerId = cid();
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
                const raidResult = S.completeTargetRaid(raw, vicTeam.id, attackerId, attacker.teamId, mistakes);
                const amt = raidResult.payout;
                if (amt <= 0) {
                    persist(raw);
                    const tooManyMistakes = mistakes * S.MISTAKE_LOOT_PENALTY >= S.RAID_BASE_PAYOUT;
                    return {
                        ok: false,
                        error: tooManyMistakes
                            ? "失误过多，本次攻坚无收益。"
                            : "目标队库余额不足，本次无收益。"
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
                    raidMistakes: mistakes,
                    raidBase: raidResult.base
                });
                if (raw.transactions.length > 50) raw.transactions.length = 50;
                pushActivity(raw, "transfer",
                    `${attacker.name} 攻坚 ${target.name}（${vicTeam.state || "队库"}）入账 RM ${amt.toLocaleString()}` +
                    ` · 失误 ${mistakes}`,
                    attackerId);
                persist(raw);
                return {
                    ok: true, room: getRoom(raw.id), attacker, target,
                    victimTeam: vicTeam, attackerTeam: atkTeam, amount: amt, raid: raidResult
                };
            },

            applyBankTransfer(roomId, amount) {
                const raw = getRaw(roomId);
                if (!raw) return { ok: false, error: "房间不存在。" };
                if (raw.status !== "playing") return { ok: false, error: "比赛未进行中。" };
                S.ensureTeamsAndBank(raw);
                const attackerId = cid();
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
                    `${attacker.name} 从央行提取 RM ${amt.toLocaleString()} → ${atkTeam.state || "队库"}`, attackerId);
                persist(raw);
                return { ok: true, room: getRoom(raw.id), attacker, attackerTeam: atkTeam, bank, amount: amt };
            },

            beginBankBonus(roomId, waveIndex) {
                const raw = getRaw(roomId);
                if (!raw) return { ok: false, error: "房间不存在。" };
                if (raw.status !== "playing") return { ok: false, error: "比赛未进行中。" };
                S.ensureTeamsAndBank(raw);
                const wi = Number(waveIndex);
                if (!Number.isFinite(wi) || wi < 0) return { ok: false, error: "无效波次。" };
                const attackerId = cid();
                const attacker = raw.players.find(p => p.id === attackerId);
                if (!attacker) return { ok: false, error: "你不是本房玩家。" };
                if (!attacker.teamId) return { ok: false, error: "你尚未加入队伍。" };
                const wave = S.ensureBonusWavePool(raw, wi);
                const attemptKey = S.bankBonusAttemptKey(wi, attackerId);
                const bonus = S.ensureBankBonus(raw);
                const existing = bonus.attempts[attemptKey];
                if (existing?.paid) {
                    persist(raw);
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
                persist(raw);
                return {
                    ok: true,
                    practiceOnly: false,
                    pool: wave.pool,
                    waveIndex: wi,
                    briefingSeed: `${raw.id}|${wi}|${attackerId}`,
                    startedAt
                };
            },

            confirmBankBonusOpen(roomId, waveIndex) {
                const raw = getRaw(roomId);
                if (!raw) return { ok: false, error: "房间不存在。" };
                if (raw.status !== "playing") return { ok: false, error: "比赛未进行中。" };
                const wi = Number(waveIndex);
                if (!Number.isFinite(wi) || wi < 0) return { ok: false, error: "无效波次。" };
                const attackerId = cid();
                const bonus = S.ensureBankBonus(raw);
                const attemptKey = S.bankBonusAttemptKey(wi, attackerId);
                const existing = bonus.attempts[attemptKey];
                if (existing?.paid) {
                    persist(raw);
                    return { ok: true, already: true };
                }
                bonus.attempts[attemptKey] = {
                    paid: true,
                    startedAt: Date.now(),
                    practiceOnly: false,
                    completed: false,
                    wrongCount: 0
                };
                persist(raw);
                return { ok: true };
            },

            completeBankBonus(roomId, waveIndex, payload) {
                const raw = getRaw(roomId);
                if (!raw) return { ok: false, error: "房间不存在。" };
                if (raw.status !== "playing") return { ok: false, error: "比赛未进行中。" };
                S.ensureTeamsAndBank(raw);
                const wi = Number(waveIndex);
                const attackerId = cid();
                const attacker = raw.players.find(p => p.id === attackerId);
                if (!attacker?.teamId) return { ok: false, error: "你尚未加入队伍。" };
                const atkTeam = raw.teams.find(t => t.id === attacker.teamId);
                if (!atkTeam) return { ok: false, error: "队伍数据异常。" };
                const bank = raw.bank;
                if (!bank) return { ok: false, error: "央行不可用。" };
                const bonus = S.ensureBankBonus(raw);
                const attemptKey = S.bankBonusAttemptKey(wi, attackerId);
                const attempt = bonus.attempts[attemptKey];
                if (!attempt || !attempt.paid || attempt.practiceOnly) {
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
                    `${attacker.name} 阅读情报 Bonus +RM ${amt.toLocaleString()} → ${atkTeam.state || "队库"}`, attackerId);
                persist(raw);
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
            },

            updatePlayerInRoom(roomId, patch) {
                const raw = getRaw(roomId);
                if (!raw) return { ok: false, error: "房间不存在。" };
                S.ensureTeamsAndBank(raw);
                const p = raw.players.find(x => x.id === cid());
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
                persist(raw);
                return { ok: true, room: getRoom(raw.id) };
            },

            updatePlayerProgress(roomId, progress) {
                const raw = getRaw(roomId);
                if (!raw) return { ok: false, error: "房间不存在。" };
                const p = raw.players.find(x => x.id === cid());
                if (!p) return { ok: false, error: "你不是本房玩家。" };
                p.missionProgress = { ...(p.missionProgress || {}), ...progress };
                if (progress.levels) p.missionProgress.levels = progress.levels;
                persist(raw);
                return { ok: true, room: getRoom(raw.id) };
            }
        };
    }

    function resolveRoomId(method, args) {
        if (method === "saveRoom") return (args[0]?.id || "").toUpperCase() || null;
        if (method === "createRoom") return (args[0] || "").trim().toUpperCase() || "__create__";
        if (typeof args[0] === "string") return args[0].toUpperCase();
        return null;
    }

    async function dispatch(method, args, clientId) {
        const h = handlers(clientId);
        if (typeof h[method] !== "function") {
            return { ok: false, error: `未知方法：${method}` };
        }
        const roomId = resolveRoomId(method, args);
        if (!roomId) return h[method](...args);
        return withRoomLock(roomId, () => h[method](...args));
    }

    return { dispatch, getRoom };
}

module.exports = { createRoomHandlers };
