/**
 * Shared room utilities (local + Firebase backends)
 */
window.CurrencySafeRoomShared = (function () {
    const SK = {
        clientId: "csClientId",
        roomId: "csRoomId",
        roomRole: "csRoomRole",
        roomJoinPassword: "csRoomJoinPassword"
    };

    function normalizeJoinPassword(pw) {
        return String(pw || "").trim().slice(0, 32);
    }

    function needsJoinPassword(raw, clientId) {
        if (typeof window !== "undefined" && window.CurrencySafeJoinToken) {
            return window.CurrencySafeJoinToken.needsJoinToken(raw, clientId);
        }
        if (!raw?.joinPasswordEnabled) return false;
        if (!raw?.joinTokenHash && !raw?.joinPassword) return false;
        if (clientId && clientId === raw.hostId) return false;
        const players = listFromMap(raw.players);
        const spectators = listFromMap(raw.spectators);
        if (clientId && players.some(p => p.id === clientId)) return false;
        if (clientId && spectators.some(s => s.id === clientId)) return false;
        return true;
    }

    function verifyJoinPassword(raw, password) {
        if (typeof window !== "undefined" && window.CurrencySafeJoinToken) {
            return window.CurrencySafeJoinToken.verifyJoinToken(raw, password);
        }
        if (!raw?.joinPasswordEnabled) return true;
        const t = normalizeJoinPassword(password);
        if (raw.joinTokenHash) return false;
        if (raw.joinPassword) return t === normalizeJoinPassword(raw.joinPassword);
        return true;
    }

    function stripJoinSecrets(raw) {
        if (!raw || typeof raw !== "object") return raw;
        const copy = { ...raw };
        delete copy.joinPassword;
        delete copy.joinTokenHash;
        return copy;
    }

    function uid() {
        return "P" + Math.random().toString(36).slice(2, 10).toUpperCase();
    }

    const BANK_TARGET_ID = "__BANK__";
    const ROOM_SCHEMA_VERSION = 2;
    const DEFAULT_TEAM_VAULT = 1000;

    function ensureTeamFields(team) {
        if (!team) return team;
        if (team.vaultBalance == null || Number.isNaN(Number(team.vaultBalance))) {
            team.vaultBalance = DEFAULT_TEAM_VAULT;
        }
        team.memberIds = memberIdList(team.memberIds);
        return team;
    }

    function getTeamById(room, teamId) {
        if (!room?.teams || !teamId) return null;
        return room.teams.find(t => t.id === teamId) || null;
    }

    function getTeamForTargetPlayer(room, playerId) {
        const p = room?.players?.find(x => x.id === playerId);
        if (!p?.teamId) return null;
        return getTeamById(room, p.teamId);
    }

    function syncTeamPasswordToMembers(raw, team) {
        if (!raw || !team?.password) return;
        const players = listFromMap(raw.players);
        players.filter(p => p.teamId === team.id).forEach(p => {
            p.password = team.password;
            p.passwordUpdatedAt = team.passwordUpdatedAt || Date.now();
        });
        raw.players = players;
    }

    function migrateRoomSchema(raw) {
        if (!raw) return raw;
        ensureTeamsAndBankCore(raw);
        const ver = raw.schemaVersion || 1;
        if (ver >= ROOM_SCHEMA_VERSION) {
            (raw.teams || []).forEach(ensureTeamFields);
            if (!raw.playerStats) raw.playerStats = {};
            if (raw.joinPasswordEnabled == null) raw.joinPasswordEnabled = false;
            return raw;
        }
        const players = listFromMap(raw.players);
        (raw.teams || []).forEach(team => {
            ensureTeamFields(team);
            const members = players.filter(p => p.teamId === team.id);
            const sum = members.reduce((s, p) => s + (Number(p.balance) || 0), 0);
            if (sum > 0) team.vaultBalance = sum;
            const lead = members.find(m => m.password) || members[0];
            if (lead?.password && !team.password) {
                team.password = lead.password;
                team.passwordUpdatedAt = lead.passwordUpdatedAt || Date.now();
            }
            ensureVaultCredentials(team);
            syncTeamPasswordToMembers(raw, team);
            members.forEach(p => { p.balance = 0; });
        });
        raw.players = players;
        raw.playerStats = raw.playerStats || {};
        raw.schemaVersion = ROOM_SCHEMA_VERSION;
        return raw;
    }

    function newTeamRecord(partial) {
        const team = { vaultBalance: DEFAULT_TEAM_VAULT, memberIds: [], ...partial };
        ensureTeamFields(team);
        return team;
    }

    function creditTeamVault(raw, teamId, amount) {
        const team = (raw.teams || []).find(t => t.id === teamId);
        if (!team) return false;
        ensureTeamFields(team);
        team.vaultBalance = (Number(team.vaultBalance) || 0) + (Number(amount) || 0);
        return true;
    }

    function debitTeamVault(raw, teamId, amount) {
        const team = (raw.teams || []).find(t => t.id === teamId);
        const amt = Number(amount) || 0;
        if (!team || amt <= 0) return false;
        ensureTeamFields(team);
        if ((Number(team.vaultBalance) || 0) < amt) return false;
        team.vaultBalance = (Number(team.vaultBalance) || 0) - amt;
        return true;
    }

    function rotateTeamVaultPassword(raw, team) {
        if (!team) return;
        team.password = randomVaultPassword(8);
        team.passwordUpdatedAt = Date.now();
        syncTeamPasswordToMembers(raw, team);
    }

    function recordPlayerEarnings(raw, playerId, amount, kind) {
        if (!raw.playerStats) raw.playerStats = {};
        if (!raw.playerStats[playerId]) {
            raw.playerStats[playerId] = { raidEarned: 0, bonusEarned: 0 };
        }
        const key = kind === "bonus" ? "bonusEarned" : "raidEarned";
        raw.playerStats[playerId][key] = (raw.playerStats[playerId][key] || 0) + (Number(amount) || 0);
    }

    const LAUNCH_COUNTDOWN_SEC = 5;

    function getLaunchCountdownRemaining(room, nowMs) {
        if (!room || room.status !== "lobby" || !room.launchCountdownAt) return null;
        const elapsed = Math.floor(((Number(nowMs) || Date.now()) - room.launchCountdownAt) / 1000);
        return Math.max(0, LAUNCH_COUNTDOWN_SEC - elapsed);
    }

    function defaultBankBonus() {
        return {
            waveIndex: 0,
            waves: {},
            completions: [],
            attempts: {}
        };
    }

    function ensureBankBonus(raw) {
        if (!raw) return defaultBankBonus();
        if (!raw.bankBonus) raw.bankBonus = defaultBankBonus();
        if (!raw.bankBonus.waves) raw.bankBonus.waves = {};
        if (!raw.bankBonus.completions) raw.bankBonus.completions = [];
        if (!raw.bankBonus.attempts) raw.bankBonus.attempts = {};
        return raw.bankBonus;
    }

    const BONUS_LOOT = {
        poolMin: 2000,
        poolMax: 5000,
        poolStep: 100,
        graceMs: 20_000,
        timeTickMs: 5_000,
        timePenalty: 50,
        wrongPenalty: 200,
        floor: 200
    };

    function bankBonusAttemptKey(waveIndex, playerId) {
        return `${waveIndex}|${playerId}`;
    }

    function rollBonusPool(seedStr, bankBalance) {
        const bal = Math.max(0, Number(bankBalance) || 0);
        const steps = Math.floor((BONUS_LOOT.poolMax - BONUS_LOOT.poolMin) / BONUS_LOOT.poolStep) + 1;
        const roll = BONUS_LOOT.poolMin + (hashSeed(seedStr) % steps) * BONUS_LOOT.poolStep;
        const capped = Math.min(roll, Math.floor(bal / BONUS_LOOT.poolStep) * BONUS_LOOT.poolStep);
        return Math.max(BONUS_LOOT.floor, capped || Math.min(roll, bal));
    }

    function computeBonusPayout(pool, startedAt, nowMs, wrongCount) {
        const poolAmt = Math.max(0, Number(pool) || 0);
        const start = Number(startedAt) || Date.now();
        const now = Number(nowMs) || Date.now();
        const wrongs = Math.max(0, Number(wrongCount) || 0);
        let remain = poolAmt;
        const elapsed = Math.max(0, now - start);
        if (elapsed > BONUS_LOOT.graceMs) {
            const ticks = Math.floor((elapsed - BONUS_LOOT.graceMs) / BONUS_LOOT.timeTickMs);
            remain -= ticks * BONUS_LOOT.timePenalty;
        }
        remain -= wrongs * BONUS_LOOT.wrongPenalty;
        remain = Math.max(BONUS_LOOT.floor, remain);
        return Math.min(poolAmt, remain);
    }

    function ensureBonusWavePool(raw, waveIndex) {
        const bonus = ensureBankBonus(raw);
        const waveKey = String(waveIndex);
        if (!bonus.waves[waveKey]) {
            const bankBal = raw.bank?.balance ?? 0;
            bonus.waves[waveKey] = {
                pool: rollBonusPool(`${raw.id}|${waveIndex}|bonus`, bankBal),
                rolledAt: Date.now()
            };
        }
        return bonus.waves[waveKey];
    }

    function defaultBank() {
        return {
            id: BANK_TARGET_ID,
            name: "马来西亚中央银行",
            balance: 50000,
            password: null,
            passwordUpdatedAt: Date.now(),
            mapX: 50,
            mapY: 48,
            lat: 4.2,
            lon: 108.5,
            state: "央行",
            stateId: "bank"
        };
    }

    function teamDeployKey(teamId, targetId) {
        return `${teamId}|${targetId}`;
    }

    function createTeamId() {
        return "T" + Math.random().toString(36).slice(2, 8).toUpperCase();
    }

    function assignStatesToTeams(teams) {
        const pool = fisherYates(window.MALAYSIA_STATES || []);
        const n = teams.length;
        const states = n <= pool.length ? pool.slice(0, n) : pool.concat(
            fisherYates(pool).slice(0, n - pool.length)
        );
        teams.forEach((team, i) => {
            const st = states[i];
            team.stateId = st.id;
            team.state = st.label;
            team.mapX = st.mapX;
            team.mapY = st.mapY;
            team.lat = st.lat;
            team.lon = st.lon;
        });
    }

    function syncPlayersFromTeams(players, teams) {
        const teamMap = Object.fromEntries((teams || []).map(t => [t.id, t]));
        (players || []).forEach(p => {
            const team = teamMap[p.teamId];
            if (!team) return;
            p.stateId = team.stateId;
            p.state = team.state;
            p.mapX = team.mapX;
            p.mapY = team.mapY;
            p.lat = team.lat;
            p.lon = team.lon;
        });
    }

    function ensureTeamsAndBankCore(raw) {
        if (!raw) return raw;
        raw.teams = listFromMap(raw.teams);
        raw.teamDeployCounts = raw.teamDeployCounts || {};
        if (!raw.bank) {
            raw.bank = defaultBank();
            ensureVaultCredentials(raw.bank);
        } else {
            ensureVaultCredentials(raw.bank);
        }
        const players = listFromMap(raw.players);
        if (!raw.teams.length && players.length) {
            raw.teams = players.map(p => {
                const tid = createTeamId();
                p.teamId = tid;
                return newTeamRecord({
                    id: tid,
                    name: p.name,
                    stateId: p.stateId,
                    state: p.state,
                    mapX: p.mapX,
                    mapY: p.mapY,
                    lat: p.lat,
                    lon: p.lon,
                    memberIds: [p.id]
                });
            });
        }
        const teamMap = Object.fromEntries(raw.teams.map(t => [t.id, t]));
        players.forEach(p => {
            if (!p.teamId || !teamMap[p.teamId]) {
                const solo = raw.teams.find(t => t.memberIds?.length === 1 && t.memberIds[0] === p.id);
                if (solo) p.teamId = solo.id;
                else {
                    const tid = createTeamId();
                    p.teamId = tid;
                    const team = newTeamRecord({
                        id: tid,
                        name: p.name,
                        stateId: p.stateId,
                        state: p.state,
                        mapX: p.mapX,
                        mapY: p.mapY,
                        lat: p.lat,
                        lon: p.lon,
                        memberIds: [p.id]
                    });
                    raw.teams.push(team);
                    teamMap[tid] = team;
                }
            }
            const team = teamMap[p.teamId];
            if (team && !(team.memberIds || []).includes(p.id)) {
                if ((team.memberIds || []).length < 4) team.memberIds.push(p.id);
            }
        });
        raw.teams.forEach(t => {
            t.memberIds = (t.memberIds || []).filter(id => players.some(p => p.id === id));
            ensureTeamFields(t);
        });
        syncPlayersFromTeams(players, raw.teams);
        raw.players = players;
        return raw;
    }

    function ensureTeamsAndBank(raw) {
        if (!raw) return raw;
        ensureTeamsAndBankCore(raw);
        return migrateRoomSchema(raw);
    }

    function getTeamForPlayer(room, playerId) {
        if (!room?.teams) return null;
        const p = room.players?.find(x => x.id === playerId);
        if (!p?.teamId) return null;
        return room.teams.find(t => t.id === p.teamId) || null;
    }

    function getTeamDeployCount(room, teamId, targetId) {
        if (!teamId || !targetId) return 0;
        return room?.teamDeployCounts?.[teamDeployKey(teamId, targetId)] || 0;
    }

    function teamBalance(room, teamId) {
        if (!teamId) return 0;
        const team = getTeamById(room, teamId);
        if (team && team.vaultBalance != null) return Number(team.vaultBalance) || 0;
        if (!room?.players) return 0;
        return room.players
            .filter(p => p.teamId === teamId)
            .reduce((s, p) => s + (Number(p.balance) || 0), 0);
    }

    function playerVaultBalance(room, playerId) {
        const team = getTeamForTargetPlayer(room, playerId);
        return team ? teamBalance(room, team.id) : 0;
    }

    function playerVaultPassword(room, playerId) {
        const team = getTeamForTargetPlayer(room, playerId);
        if (team?.password) return team.password;
        return room?.players?.find(p => p.id === playerId)?.password || "";
    }

    function isSameTeam(room, playerIdA, playerIdB) {
        if (!playerIdA || !playerIdB || playerIdA === playerIdB) return true;
        const a = room.players?.find(p => p.id === playerIdA);
        const b = room.players?.find(p => p.id === playerIdB);
        return !!(a?.teamId && a.teamId === b?.teamId);
    }

    function computeMissionScorePercent(intel, cfg) {
        if (!intel?.games?.every(g => g.solved)) return 0;
        let score = 25;
        const games = intel.games || [];
        const typing = games.find(g => g.kind === "typing");
        if (typing && cfg) {
            score -= Math.max(0, cfg.mistakes - (typing.mistakesLeft ?? 0));
        }
        const grid = games.find(g => g.kind === "grid");
        if (grid) {
            score -= Math.max(0, 3 - (grid.shields ?? 0));
            score -= Math.max(0, 2 - (grid.scansLeft ?? 0));
        }
        games.forEach(g => {
            const m = Number(g.mistakes) || 0;
            if (m <= 0) return;
            if (g.kind === "mastermind") score -= Math.min(4, m);
            else if (g.kind === "fragsort") score -= Math.min(3, m);
        });
        return Math.max(10, Math.min(25, Math.round(score)));
    }

    function computeLootAmount(poolBalance, scorePercent) {
        const pool = Math.max(0, Number(poolBalance) || 0);
        const pct = Math.max(10, Math.min(25, Number(scorePercent) || 0));
        let amt = Math.round(pool * pct / 100 / 10) * 10;
        return Math.max(10, Math.min(pool, amt));
    }

    function defaultRoomSettings(mode) {
        const practice = mode === "practice";
        const passwordRotateMs = practice ? 20 * 60 * 1000 : 12 * 60 * 1000;
        return {
            roundMs: passwordRotateMs,
            passwordRotateMs,
            maxDeployPerTarget: practice ? 999 : 3,
            maxTeamSize: 4,
            bankInitialBalance: 50000,
            trackMissionStats: practice,
            leaderboardLocked: !practice,
            mapEffects: !practice
        };
    }

    function fisherYates(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    function assignUniqueStates(players) {
        const pool = fisherYates(window.MALAYSIA_STATES || []);
        const n = players.length;
        const states = n <= pool.length ? pool.slice(0, n) : pool.concat(
            fisherYates(pool).slice(0, n - pool.length)
        );
        players.forEach((p, i) => {
            const st = states[i];
            p.stateId = st.id;
            p.state = st.label;
            p.mapX = st.mapX;
            p.mapY = st.mapY;
            p.lat = st.lat;
            p.lon = st.lon;
        });
    }

    function coordsFromState(stateId) {
        const st = window.getMalaysiaStateById(stateId);
        return {
            stateId: st.id,
            state: st.label,
            mapX: st.mapX,
            mapY: st.mapY,
            lat: st.lat,
            lon: st.lon
        };
    }

    function randomVaultPassword(len = 8) {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let out = "";
        for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
        return out;
    }

    function listFromMap(obj) {
        if (!obj) return [];
        if (Array.isArray(obj)) return obj;
        return Object.keys(obj).map(k => ({ ...obj[k], id: obj[k].id || k }));
    }

    /** Firebase stores arrays as {0: id, 1: id2}; normalize to string id list. */
    function memberIdList(val) {
        if (!val) return [];
        if (Array.isArray(val)) return val.filter(id => typeof id === "string");
        return Object.keys(val)
            .filter(k => /^\d+$/.test(k))
            .sort((a, b) => Number(a) - Number(b))
            .map(k => val[k])
            .filter(id => typeof id === "string");
    }

    function mapFromList(arr) {
        const m = {};
        (arr || []).forEach(p => { if (p?.id) m[p.id] = p; });
        return m;
    }

    function normalizeRoom(id, raw) {
        if (!raw) return null;
        ensureTeamsAndBank(raw);
        ensureBankBonus(raw);
        const players = listFromMap(raw.players).sort((a, b) => (a.order || 0) - (b.order || 0));
        const teams = listFromMap(raw.teams);
        const activity = listFromMap(raw.activity).sort((a, b) => (b.at || 0) - (a.at || 0));
        const transactions = listFromMap(raw.transactions).sort((a, b) => (b.at || 0) - (a.at || 0));
        return {
            ...raw,
            id: raw.id || id,
            players,
            teams,
            bank: raw.bank,
            teamDeployCounts: raw.teamDeployCounts || {},
            spectators: listFromMap(raw.spectators),
            visitors: listFromMap(raw.visitors),
            activity,
            transactions,
            deployLocks: raw.deployLocks || {},
            targetRaids: raw.targetRaids || {},
            bankBonus: raw.bankBonus || defaultBankBonus()
        };
    }

    function serializeLists(room) {
        return {
            ...room,
            players: mapFromList(room.players.map((p, i) => ({ ...p, order: i }))),
            teams: mapFromList(room.teams || []),
            spectators: mapFromList(room.spectators),
            activity: mapFromList(room.activity),
            transactions: mapFromList(room.transactions)
        };
    }

    function transferStatsForPlayer(player, txs) {
        let stealCount = 0, stealTotal = 0, robbedCount = 0, robbedTotal = 0;
        if (!player) return { stealCount, stealTotal, robbedCount, robbedTotal };
        (txs || []).forEach(tx => {
            const amt = Number(tx.amount) || 0;
            const isSteal = tx.toId ? tx.toId === player.id : tx.to === player.name;
            const isRobbed = tx.fromId ? tx.fromId === player.id : tx.from === player.name;
            if (isSteal) { stealCount++; stealTotal += amt; }
            if (isRobbed) { robbedCount++; robbedTotal += amt; }
        });
        return { stealCount, stealTotal, robbedCount, robbedTotal };
    }

    function transferStatsForTeam(teamId, txs) {
        let stealCount = 0, stealTotal = 0, robbedCount = 0, robbedTotal = 0;
        if (!teamId) return { stealCount, stealTotal, robbedCount, robbedTotal };
        (txs || []).forEach(tx => {
            const amt = Number(tx.amount) || 0;
            if (tx.toTeamId && tx.toTeamId === teamId) {
                stealCount++;
                stealTotal += amt;
            } else if (!tx.toTeamId && tx.toId) {
                /* legacy txs without team ids — skip team rollup */
            }
            if (tx.fromTeamId && tx.fromTeamId === teamId) {
                robbedCount++;
                robbedTotal += amt;
            }
        });
        return { stealCount, stealTotal, robbedCount, robbedTotal };
    }

    function freshMissionProgress() {
        return { targetId: null, targetName: null, levels: [false, false, false] };
    }

    function getRoundMs(room) {
        if (!room) return 12 * 60 * 1000;
        return room.settings?.roundMs ?? defaultRoomSettings(room.mode).roundMs;
    }

    function getPasswordRotateMs(room) {
        if (!room) return 20 * 60 * 1000;
        return room.settings?.passwordRotateMs
            ?? defaultRoomSettings(room.mode).passwordRotateMs;
    }

    function ensureVaultCredentials(player) {
        if (!player) return player;
        if (!player.password) {
            player.password = randomVaultPassword(8);
            player.passwordUpdatedAt = Date.now();
        }
        return player;
    }

    function getMatchRemainingMs(room) {
        if (!room || room.status !== "playing" || !room.matchStartedAt) return null;
        return room.matchStartedAt + getRoundMs(room) - Date.now();
    }

    function parseMatchMinutes(minutes) {
        const m = Math.floor(Number(minutes));
        if (!Number.isFinite(m) || m < 1) return null;
        return m;
    }

    function isValidParticipantName(name) {
        const t = String(name || "").trim();
        if (!t) return false;
        if (/^unknown$/i.test(t)) return false;
        return true;
    }

    function getPendingVisitors(room, staleMs) {
        if (!room) return [];
        const maxAge = staleMs == null ? 120000 : staleMs;
        const now = Date.now();
        const visitors = listFromMap(room.visitors);
        return visitors.filter(v => {
            if (!v.lastSeen || now - v.lastSeen > maxAge) return false;
            if (room.players.some(p => p.id === v.id)) return false;
            if ((room.spectators || []).some(s => s.id === v.id)) return false;
            return true;
        });
    }

    function validateLobbyForStart(room, hostClientId) {
        if (!room) return { ok: false, error: "房间不存在。" };
        const hostAsPlayer = room.players.some(p => p.id === hostClientId);
        const hostAsSpec = (room.spectators || []).some(s => s.id === hostClientId);
        if (!hostAsPlayer && !hostAsSpec) {
            return { ok: false, error: "房主请先填写名称，并点击「以玩家加入」或「以观战加入」。" };
        }
        for (const p of room.players) {
            if (!isValidParticipantName(p.name)) {
                return { ok: false, error: `玩家名称无效（不能为 unknown 或空白）：${p.name || "—"}` };
            }
        }
        for (const s of room.spectators || []) {
            if (!isValidParticipantName(s.name)) {
                return { ok: false, error: `观战名称无效：${s.name || "—"}` };
            }
        }
        const pending = getPendingVisitors(room);
        if (pending.length) {
            return {
                ok: false,
                error: `还有 ${pending.length} 人在大厅未选择加入或观战，请等待对方完成登记。`
            };
        }
        return { ok: true };
    }

    function buildCsv(room) {
        const lines = [];
        const txs = room.transactions || [];
        lines.push("Currency Safe Room Export");
        lines.push(`Room,${room.id}`);
        lines.push(`Mode,${room.mode}`);
        lines.push(`Status,${room.status}`);
        lines.push(`Started,${room.matchStartedAt ? new Date(room.matchStartedAt).toISOString() : ""}`);
        lines.push("");
        lines.push("Rank,Team,State,VaultBalance,Members");
        const teamsSorted = [...(room.teams || [])].sort(
            (a, b) => teamBalance(room, b.id) - teamBalance(room, a.id)
        );
        teamsSorted.forEach((tm, i) => {
            const n = (tm.memberIds || []).length;
            lines.push([
                i + 1, csvEsc(tm.name || tm.state), csvEsc(tm.state),
                teamBalance(room, tm.id), n
            ].join(","));
        });
        lines.push("");
        lines.push("Rank,Player,RaidEarned,BonusEarned,TotalEarned");
        const playerStats = room.playerStats || {};
        const earners = [...(room.players || [])].map(p => {
            const st = playerStats[p.id] || {};
            const raid = Number(st.raidEarned) || 0;
            const bonus = Number(st.bonusEarned) || 0;
            return { name: p.name, raid, bonus, total: raid + bonus };
        }).sort((a, b) => b.total - a.total);
        earners.forEach((p, i) => {
            lines.push([i + 1, csvEsc(p.name), p.raid, p.bonus, p.total].join(","));
        });
        lines.push("");
        lines.push("Rank,Name,State,TeamVault,StealCount,StealTotal,RobbedCount,RobbedTotal,LevelsDone");
        const sorted = [...room.players].sort(
            (a, b) => playerVaultBalance(room, b.id) - playerVaultBalance(room, a.id)
        );
        sorted.forEach((p, i) => {
            const lv = (p.missionProgress?.levels || []).filter(Boolean).length;
            const st = transferStatsForPlayer(p, txs);
            lines.push([
                i + 1, csvEsc(p.name), csvEsc(p.state), playerVaultBalance(room, p.id),
                st.stealCount, st.stealTotal, st.robbedCount, st.robbedTotal, lv
            ].join(","));
        });
        lines.push("");
        lines.push("ActivityTime,Type,Message");
        (room.activity || []).slice(0, 80).forEach(a => {
            lines.push([new Date(a.at).toISOString(), csvEsc(a.type), csvEsc(a.message)].join(","));
        });
        return lines.join("\n");
    }

    function csvEsc(s) {
        const t = String(s ?? "");
        return t.includes(",") || t.includes('"') ? `"${t.replace(/"/g, '""')}"` : t;
    }

    function downloadCsv(filename, content) {
        const blob = new Blob(["\ufeff" + content], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    function hashSeed(str) {
        let h = 2166136261;
        const s = String(str || "");
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    function roundPoolHundreds(n) {
        const v = Math.max(0, Number(n) || 0);
        return Math.round(v / 100) * 100;
    }

    function ensureTargetRaids(raw) {
        if (!raw.targetRaids) raw.targetRaids = {};
        return raw.targetRaids;
    }

    function normalizeRaidRecord(raid) {
        if (!raid) return null;
        if (!Array.isArray(raid.activeAttackers)) {
            raid.activeAttackers = listFromMap(raid.activeAttackers);
        }
        if (!Array.isArray(raid.completed)) {
            raid.completed = listFromMap(raid.completed);
        }
        return raid;
    }

    function getTargetRaid(raw, victimTeamId) {
        if (!raw?.targetRaids || !victimTeamId) return null;
        const raid = raw.targetRaids[victimTeamId];
        return normalizeRaidRecord(raid);
    }

    function rollRaidPercent(room, victimTeamId) {
        const seed = `${room?.id || ""}|${victimTeamId}|${room?.matchStartedAt || 0}`;
        return 25 + (hashSeed(seed) % 16);
    }

    function shouldStartNewRaid(raid) {
        if (!raid) return true;
        const active = (raid.activeAttackers || []).length;
        return (Number(raid.lootPotRemaining) || 0) <= 0 && active === 0;
    }

    function initTargetRaid(raw, victimTeamId, percentOverride) {
        const vault = teamBalance(raw, victimTeamId);
        const percent = percentOverride != null
            ? Number(percentOverride)
            : rollRaidPercent(raw, victimTeamId);
        const pool = roundPoolHundreds(vault * percent / 100);
        return {
            victimTeamId,
            percent,
            lootPotTotal: pool,
            lootPotRemaining: pool,
            activeAttackers: [],
            completed: [],
            startedAt: Date.now()
        };
    }

    function getOrCreateTargetRaid(raw, victimTeamId) {
        ensureTargetRaids(raw);
        let raid = getTargetRaid(raw, victimTeamId);
        if (shouldStartNewRaid(raid)) {
            raid = initTargetRaid(raw, victimTeamId);
            raw.targetRaids[victimTeamId] = raid;
        }
        return raid;
    }

    function joinTargetRaid(raw, victimTeamId, playerId, attackerTeamId) {
        if (!victimTeamId || !playerId || !attackerTeamId) return null;
        const raid = getOrCreateTargetRaid(raw, victimTeamId);
        const exists = (raid.activeAttackers || []).some(a => a.playerId === playerId);
        if (!exists) {
            raid.activeAttackers.push({
                playerId,
                teamId: attackerTeamId,
                joinedAt: Date.now()
            });
        }
        return raid;
    }

    function computeRaidShare(raid) {
        if (!raid) return 0;
        const remaining = Math.max(0, Number(raid.lootPotRemaining) || 0);
        const n = Math.max(1, (raid.activeAttackers || []).length);
        return remaining / n;
    }

    function computeRaidPayout(share, mistakes) {
        const s = Math.max(0, Number(share) || 0);
        const m = Math.max(0, Math.min(20, Number(mistakes) || 0));
        return Math.round(s * Math.max(0, 1 - m / 20));
    }

    function previewRaidPayout(raw, victimTeamId, playerId, mistakes) {
        const raid = getTargetRaid(raw, victimTeamId);
        if (!raid) return { payout: 0, share: 0, activeCount: 0, percent: 0, poolRemaining: 0 };
        const activeCount = Math.max(1, (raid.activeAttackers || []).length);
        const inRaid = (raid.activeAttackers || []).some(a => a.playerId === playerId);
        const share = inRaid ? computeRaidShare(raid) : computeRaidShare({
            ...raid,
            activeAttackers: [...(raid.activeAttackers || []), { playerId }]
        });
        let payout = computeRaidPayout(share, mistakes);
        payout = Math.min(payout, Math.max(0, Number(raid.lootPotRemaining) || 0));
        payout = Math.min(payout, teamBalance(raw, victimTeamId));
        return {
            payout,
            share,
            activeCount: inRaid ? activeCount : activeCount + 1,
            percent: raid.percent,
            poolRemaining: raid.lootPotRemaining
        };
    }

    function completeTargetRaid(raw, victimTeamId, playerId, attackerTeamId, mistakes) {
        ensureTargetRaids(raw);
        let raid = getTargetRaid(raw, victimTeamId);
        if (!raid) {
            raid = getOrCreateTargetRaid(raw, victimTeamId);
            joinTargetRaid(raw, victimTeamId, playerId, attackerTeamId);
            raid = getTargetRaid(raw, victimTeamId);
        }
        if (!(raid.activeAttackers || []).some(a => a.playerId === playerId)) {
            joinTargetRaid(raw, victimTeamId, playerId, attackerTeamId);
            raid = getTargetRaid(raw, victimTeamId);
        }
        const activeCount = Math.max(1, (raid.activeAttackers || []).length);
        const share = computeRaidShare(raid);
        let payout = computeRaidPayout(share, mistakes);
        payout = Math.min(payout, Math.max(0, Number(raid.lootPotRemaining) || 0));
        payout = Math.min(payout, teamBalance(raw, victimTeamId));
        payout = Math.max(0, payout);

        raid.lootPotRemaining = Math.max(0, (Number(raid.lootPotRemaining) || 0) - payout);
        raid.activeAttackers = (raid.activeAttackers || []).filter(a => a.playerId !== playerId);
        raid.completed = raid.completed || [];
        raid.completed.push({
            playerId,
            teamId: attackerTeamId,
            amount: payout,
            mistakes: Math.max(0, Math.min(20, Number(mistakes) || 0)),
            shareAtComplete: share,
            activeCountAtComplete: activeCount,
            at: Date.now()
        });

        return {
            payout,
            share,
            activeCount,
            percent: raid.percent,
            poolRemaining: raid.lootPotRemaining
        };
    }

    return {
        SK, uid, BANK_TARGET_ID, ROOM_SCHEMA_VERSION, DEFAULT_TEAM_VAULT,
        defaultRoomSettings, defaultBank, defaultBankBonus, ensureBankBonus, fisherYates,
        assignUniqueStates, assignStatesToTeams, syncPlayersFromTeams,
        ensureTeamsAndBank, ensureTeamsAndBankCore, migrateRoomSchema, newTeamRecord,
        createTeamId, teamDeployKey,
        getTeamById, getTeamForPlayer, getTeamForTargetPlayer,
        getTeamDeployCount, teamBalance, playerVaultBalance, playerVaultPassword,
        creditTeamVault, debitTeamVault, rotateTeamVaultPassword, recordPlayerEarnings,
        syncTeamPasswordToMembers, ensureTeamFields, isSameTeam,
        computeMissionScorePercent, computeLootAmount,
        coordsFromState, randomVaultPassword, normalizeRoom, serializeLists,
        listFromMap, mapFromList, memberIdList, buildCsv, downloadCsv,
        transferStatsForPlayer, transferStatsForTeam,
        hashSeed, roundPoolHundreds, ensureTargetRaids, getTargetRaid, rollRaidPercent,
        getOrCreateTargetRaid, joinTargetRaid, computeRaidShare, computeRaidPayout,
        previewRaidPayout, completeTargetRaid, shouldStartNewRaid,
        stripJoinSecrets,
        normalizeJoinPassword, needsJoinPassword, verifyJoinPassword,
        BONUS_LOOT, bankBonusAttemptKey, rollBonusPool, computeBonusPayout, ensureBonusWavePool,
        LAUNCH_COUNTDOWN_SEC, getLaunchCountdownRemaining,
        freshMissionProgress, getRoundMs, getPasswordRotateMs, getMatchRemainingMs, parseMatchMinutes,
        isValidParticipantName, getPendingVisitors, validateLobbyForStart, ensureVaultCredentials
    };
})();
