/**
 * Mission game pool — enabled toggles, random pick (practice) / seeded pick (competitive).
 * Generators are registered from game.html via MissionGames.setGenerators().
 */
(function (global) {
    const SLOT_COUNT = 3;

    /** @type {Record<string, { id: string, enabled: boolean, icon: string, shortLabel: string, modes?: string[], weight?: number }>} */
    const MISSION_GAME_REGISTRY = {
        typing: {
            id: "typing",
            enabled: true,
            icon: "💰",
            shortLabel: "拦截转账码",
            modes: ["solo", "mp"],
            weight: 1
        },
        dial: {
            id: "dial",
            enabled: true,
            icon: "🗺️",
            shortLabel: "破译密语",
            modes: ["solo", "mp"],
            weight: 1
        },
        grid: {
            id: "grid",
            enabled: true,
            icon: "🚨",
            shortLabel: "潜入网格",
            modes: ["solo", "mp"],
            weight: 1
        },
        mastermind: {
            id: "mastermind",
            enabled: true,
            icon: "🎨",
            shortLabel: "热力破解",
            modes: ["solo", "mp"],
            weight: 1
        },
        fragsort: {
            id: "fragsort",
            enabled: false,
            icon: "🧩",
            shortLabel: "碎片排序",
            modes: ["solo", "mp"],
            weight: 0
        },
        binary: {
            id: "binary",
            enabled: true,
            icon: "💡",
            shortLabel: "二进制灯泡",
            modes: ["solo", "mp"],
            weight: 1
        },
        phishing: {
            id: "phishing",
            enabled: false,
            icon: "📧",
            shortLabel: "识破钓鱼",
            modes: ["solo", "mp"],
            weight: 1
        },
        logtrace: {
            id: "logtrace",
            enabled: false,
            icon: "📋",
            shortLabel: "日志追踪",
            modes: ["solo", "mp"],
            weight: 1
        },
        hashmatch: {
            id: "hashmatch",
            enabled: false,
            icon: "🔐",
            shortLabel: "指纹比对",
            modes: ["solo", "mp"],
            weight: 1
        },
        wiretap: {
            id: "wiretap",
            enabled: false,
            icon: "📻",
            shortLabel: "电台截听",
            modes: ["solo", "mp"],
            weight: 1
        },
        permatrix: {
            id: "permatrix",
            enabled: false,
            icon: "🛡️",
            shortLabel: "权限矩阵",
            modes: ["solo", "mp"],
            weight: 1
        }
    };

    /** @type {Record<string, function(string, object): object>} */
    let generators = {};

    function hashSeed(str) {
        let h = 2166136261;
        const s = String(str || "");
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    function seededShuffle(arr, seed) {
        const a = [...arr];
        let s = (seed >>> 0) || 1;
        for (let i = a.length - 1; i > 0; i--) {
            s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
            const j = s % (i + 1);
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    function getKindMeta(kindId) {
        return MISSION_GAME_REGISTRY[kindId] || null;
    }

    function isKindEnabled(kindId, ctx) {
        const def = MISSION_GAME_REGISTRY[kindId];
        if (!def || !def.enabled) return false;
        if (def.modes && ctx?.modeKey && !def.modes.includes(ctx.modeKey)) return false;
        const roomToggle = ctx?.roomSettings?.[kindId];
        if (roomToggle === false) return false;
        return !!generators[kindId];
    }

    function getEligibleKindIds(ctx) {
        return Object.keys(MISSION_GAME_REGISTRY).filter(id => isKindEnabled(id, ctx));
    }

    function pickMissionKindIds(ctx) {
        const pool = getEligibleKindIds(ctx);
        if (pool.length < SLOT_COUNT) {
            return { ok: false, error: `启用关卡不足 ${SLOT_COUNT} 个（当前 ${pool.length} 个）。请在 mission-games.js 将更多关卡设为 enabled: true。` };
        }
        const weighted = [];
        pool.forEach(id => {
            const w = Math.max(1, MISSION_GAME_REGISTRY[id]?.weight || 1);
            for (let i = 0; i < w; i++) weighted.push(id);
        });
        const uniquePool = [...new Set(weighted)];
        let ordered;
        if (ctx?.competitive) {
            const seed = hashSeed(
                `${ctx.roomId}|${ctx.targetId}|${ctx.deploySeq}|${ctx.matchStartedAt}`
            );
            ordered = seededShuffle(uniquePool, seed);
        } else {
            const seed = (Math.random() * 0xffffffff) >>> 0;
            ordered = seededShuffle(uniquePool, seed);
        }
        const picked = [];
        for (const id of ordered) {
            if (picked.length >= SLOT_COUNT) break;
            if (!picked.includes(id)) picked.push(id);
        }
        if (picked.length < SLOT_COUNT) {
            for (const id of pool) {
                if (picked.length >= SLOT_COUNT) break;
                if (!picked.includes(id)) picked.push(id);
            }
        }
        return { ok: true, kinds: picked.slice(0, SLOT_COUNT) };
    }

    function createMissionGame(kindId, fragment, ctx) {
        const gen = generators[kindId];
        if (!gen) throw new Error(`Mission generator not registered: ${kindId}`);
        return gen(fragment, ctx);
    }

    function formatPickedKindsLabel(kindIds) {
        return (kindIds || [])
            .map(id => {
                const m = getKindMeta(id);
                return m ? `${m.icon} ${m.shortLabel}` : id;
            })
            .join(" · ");
    }

    function formatPickedKindsIcons(kindIds) {
        return (kindIds || []).map(id => getKindMeta(id)?.icon || "❓").join(" ");
    }

    function setGenerators(map) {
        generators = { ...generators, ...map };
    }

    function migrateIntelMeta(intel) {
        if (!intel?.games?.length) return intel;
        if (!intel.pickedKinds || intel.pickedKinds.length !== intel.games.length) {
            intel.pickedKinds = intel.games.map(g => g.kind).filter(Boolean);
        }
        intel.games.forEach((g, i) => {
            g.slotIndex = i;
            if (!g.kind && intel.pickedKinds[i]) g.kind = intel.pickedKinds[i];
        });
        return intel;
    }

    global.MissionGames = {
        SLOT_COUNT,
        REGISTRY: MISSION_GAME_REGISTRY,
        setGenerators,
        getKindMeta,
        isKindEnabled,
        getEligibleKindIds,
        pickMissionKindIds,
        createMissionGame,
        formatPickedKindsLabel,
        formatPickedKindsIcons,
        migrateIntelMeta,
        hashSeed
    };
})(typeof window !== "undefined" ? window : globalThis);
