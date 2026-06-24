/**
 * Shared room utilities (local + Firebase backends)
 */
window.CurrencySafeRoomShared = (function () {
    const SK = {
        clientId: "csClientId",
        roomId: "csRoomId",
        roomRole: "csRoomRole"
    };

    function uid() {
        return "P" + Math.random().toString(36).slice(2, 10).toUpperCase();
    }

    function defaultRoomSettings(mode) {
        const practice = mode === "practice";
        return {
            roundMs: practice ? 20 * 60 * 1000 : 12 * 60 * 1000,
            maxDeployPerTarget: practice ? 999 : 3,
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

    function mapFromList(arr) {
        const m = {};
        (arr || []).forEach(p => { if (p?.id) m[p.id] = p; });
        return m;
    }

    function normalizeRoom(id, raw) {
        if (!raw) return null;
        const players = listFromMap(raw.players).sort((a, b) => (a.order || 0) - (b.order || 0));
        const activity = listFromMap(raw.activity).sort((a, b) => (b.at || 0) - (a.at || 0));
        const transactions = listFromMap(raw.transactions).sort((a, b) => (b.at || 0) - (a.at || 0));
        return {
            ...raw,
            id: raw.id || id,
            players,
            spectators: listFromMap(raw.spectators),
            activity,
            transactions,
            deployLocks: raw.deployLocks || {}
        };
    }

    function serializeLists(room) {
        return {
            ...room,
            players: mapFromList(room.players.map((p, i) => ({ ...p, order: i }))),
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

    function freshMissionProgress() {
        return { targetId: null, targetName: null, levels: [false, false, false] };
    }

    function getRoundMs(room) {
        if (!room) return 12 * 60 * 1000;
        return room.settings?.roundMs ?? defaultRoomSettings(room.mode).roundMs;
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

    function buildCsv(room) {
        const lines = [];
        const txs = room.transactions || [];
        lines.push("Currency Safe Room Export");
        lines.push(`Room,${room.id}`);
        lines.push(`Mode,${room.mode}`);
        lines.push(`Status,${room.status}`);
        lines.push(`Started,${room.matchStartedAt ? new Date(room.matchStartedAt).toISOString() : ""}`);
        lines.push("");
        lines.push("Rank,Name,State,Balance,StealCount,StealTotal,RobbedCount,RobbedTotal,LevelsDone");
        const sorted = [...room.players].sort((a, b) => (b.balance || 0) - (a.balance || 0));
        sorted.forEach((p, i) => {
            const lv = (p.missionProgress?.levels || []).filter(Boolean).length;
            const st = transferStatsForPlayer(p, txs);
            lines.push([
                i + 1, csvEsc(p.name), csvEsc(p.state), p.balance || 0,
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

    return {
        SK, uid, defaultRoomSettings, fisherYates, assignUniqueStates,
        coordsFromState, randomVaultPassword, normalizeRoom, serializeLists,
        listFromMap, mapFromList, buildCsv, downloadCsv, transferStatsForPlayer,
        freshMissionProgress, getRoundMs, getMatchRemainingMs, parseMatchMinutes
    };
})();
