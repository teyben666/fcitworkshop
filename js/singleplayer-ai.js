/**
 * Currency Safe — 单人模式 AI 对手
 */
window.CurrencySafeSingleAI = (function () {
    const NAMES = {
        zh: ["赤色金库", "霓虹账本", "密码港", "欧米伽铸币", "阿特拉斯信贷", "暗影银行", "量子保险箱", "太阳账本", "泰坦钱袋", "幽灵币"],
        en: ["Crimson Vault", "Neon Ledger", "Cipher Harbor", "Omega Mint", "Atlas Credit", "Shadow Bank", "Quantum Safe", "Solar Ledger", "Titan Purse", "Ghost Coin"]
    };
    const PIN_ICONS = ["💻", "🔐", "💾", "🛰️", "💰", "🏦", "⚙️", "📡"];

    function shuffle(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    function createTeams(opts) {
        const {
            count = 5,
            lang = "zh",
            teamCoordsFromState,
            malaysiaImagePercentToWrapPercent,
            uid,
            randomPassword,
            randomPick,
            balancePool = [900, 1000, 1100, 1200, 1300]
        } = opts;
        const names = shuffle(NAMES[lang === "en" ? "en" : "zh"]).slice(0, count);
        const states = shuffle(window.MALAYSIA_STATES || []).slice(0, count);
        return names.map((name, idx) => {
            const st = states[idx % states.length];
            const coords = teamCoordsFromState(st);
            const pct = malaysiaImagePercentToWrapPercent(coords.mapX, coords.mapY);
            return {
                id: uid(),
                name,
                password: randomPassword(8),
                balance: randomPick(balancePool),
                x: pct.x,
                y: pct.y,
                mapX: coords.mapX,
                mapY: coords.mapY,
                lat: coords.lat,
                lon: coords.lon,
                state: coords.state,
                stateId: coords.stateId,
                city: coords.state,
                icon: PIN_ICONS[idx % PIN_ICONS.length],
                passwordUpdatedAt: Date.now(),
                wins: 0,
                losses: 0,
                isAI: true,
                isOpponent: true,
                vaultReady: true
            };
        });
    }

    /**
     * @param {object} ctx — game runtime hooks
     * @returns {boolean} whether state changed
     */
    function autoRotate(ctx) {
        const {
            state, getRoundMs, isMissionActive, targetId,
            buildIntelForTarget, stopTypingArc, stopGridPhaseTimers,
            getCurrentIntel, setCurrentIntel, setBreachUnlocked,
            clearPasswordGuess, showToast, randomPassword, t
        } = ctx;
        let changed = false;
        const ms = getRoundMs();
        (state.opponents || []).forEach(team => {
            if (!team.isAI) return;
            if (Date.now() - team.passwordUpdatedAt < ms) return;
            if (targetId === team.id && isMissionActive()) {
                team.passwordUpdatedAt = Date.now();
                return;
            }
            team.password = randomPassword(8);
            team.passwordUpdatedAt = Date.now();
            changed = true;
            if (targetId === team.id) {
                const intel = getCurrentIntel();
                const kept = intel ? [...intel.fragments] : [null, null, null];
                stopTypingArc();
                stopGridPhaseTimers();
                const next = buildIntelForTarget(team);
                kept.forEach((f, i) => {
                    if (f && next.games[i]) {
                        next.fragments[i] = f;
                        next.games[i].solved = true;
                    }
                });
                setCurrentIntel(next);
                setBreachUnlocked(false);
                clearPasswordGuess();
                showToast(t("aiRotated").replace("{name}", team.name));
            }
        });
        return changed;
    }

    return { NAMES, PIN_ICONS, createTeams, autoRotate };
})();
