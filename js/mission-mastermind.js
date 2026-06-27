/**
 * Mastermind mini-game — 6-color palette, pick 4 (practice 10 / competitive 8 guesses).
 */
(function (global) {
    function mT(k, v) {
        return global.MissionI18n?.mT?.(k, v) ?? k;
    }

    const COLORS = [
        { id: "R", label: "红", hex: "#ef4444" },
        { id: "O", label: "橙", hex: "#f97316" },
        { id: "Y", label: "黄", hex: "#eab308" },
        { id: "G", label: "绿", hex: "#22c55e" },
        { id: "B", label: "蓝", hex: "#3b82f6" },
        { id: "P", label: "紫", hex: "#a855f7" }
    ];

    const COLOR_BY_ID = Object.fromEntries(COLORS.map(c => [c.id, c]));

    function colorLabel(colorId) {
        return mT(`mission.color.${colorId}`);
    }

    function hashSeed(str) {
        return global.MissionGames?.hashSeed?.(str) ?? 1;
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

    function buildSecret(seedStr) {
        const pool = seededShuffle(COLORS.map(c => c.id), hashSeed(seedStr));
        return pool.slice(0, 4);
    }

    function evaluateGuess(secret, guess) {
        let greens = 0;
        const sRem = [];
        const gRem = [];
        for (let i = 0; i < 4; i++) {
            if (secret[i] === guess[i]) greens++;
            else {
                sRem.push(secret[i]);
                gRem.push(guess[i]);
            }
        }
        let yellows = 0;
        gRem.forEach(g => {
            const idx = sRem.indexOf(g);
            if (idx >= 0) {
                yellows++;
                sRem.splice(idx, 1);
            }
        });
        return { greens, yellows };
    }

    function generate(fragment, ctx) {
        const competitive = !!ctx?.competitive;
        const seedStr = `${ctx?.password || ""}|${fragment}|${ctx?.target?.id || ""}`;
        return {
            kind: "mastermind",
            title: mT("mission.mastermind.title"),
            solved: false,
            mistakes: 0,
            secret: buildSecret(seedStr),
            maxGuesses: competitive ? 8 : 10,
            guesses: [],
            currentPick: [null, null, null, null],
            activeSlot: 0,
            lastFeedbackAt: 0,
            reveal: fragment || "",
            agentNote: mT("mission.mastermind.agentNote")
        };
    }

    function migrate(game) {
        if (!game || game.kind !== "mastermind") return;
        if (!Array.isArray(game.secret) || game.secret.length !== 4) {
            game.secret = buildSecret(game.reveal || "KEY");
        }
        if (!Array.isArray(game.guesses)) game.guesses = [];
        if (!Array.isArray(game.currentPick) || game.currentPick.length !== 4) {
            game.currentPick = [null, null, null, null];
        }
        if (typeof game.mistakes !== "number") game.mistakes = 0;
        if (typeof game.activeSlot !== "number") game.activeSlot = 0;
        if (!game.maxGuesses) game.maxGuesses = 10;
        if (typeof game.lastFeedbackAt !== "number") game.lastFeedbackAt = 0;
        game.title = mT("mission.mastermind.title");
        game.agentNote = mT("mission.mastermind.agentNote");
    }

    function pickColor(game, colorId) {
        if (!game || game.solved) return;
        const slot = game.activeSlot ?? 0;
        game.currentPick[slot] = colorId;
        const next = game.currentPick.findIndex(c => !c);
        game.activeSlot = next >= 0 ? next : 3;
    }

    function clearPick(game) {
        if (!game || game.solved) return;
        game.currentPick = [null, null, null, null];
        game.activeSlot = 0;
    }

    function submitGuess(game) {
        if (!game || game.solved) return { ok: false, reason: "done" };
        if (game.currentPick.some(c => !c)) return { ok: false, reason: "incomplete" };
        const guess = [...game.currentPick];
        const { greens, yellows } = evaluateGuess(game.secret, guess);
        game.guesses.push({ guess, greens, yellows });
        game.lastFeedbackAt = Date.now();
        clearPick(game);

        if (greens === 4) {
            return { ok: true, win: true };
        }
        if (game.guesses.length >= game.maxGuesses) {
            return { ok: true, win: false, exhausted: true };
        }
        return { ok: true, win: false, greens, yellows, rowIndex: game.guesses.length - 1 };
    }

    function renderDots(greens, yellows, animate) {
        let html = "";
        for (let i = 0; i < greens; i++) {
            html += `<span class="mm-dot mm-dot-green${animate ? " mm-bulb-pop" : ""}" style="animation-delay:${i * 60}ms"></span>`;
        }
        for (let i = 0; i < yellows; i++) {
            html += `<span class="mm-dot mm-dot-yellow${animate ? " mm-bulb-pop" : ""}" style="animation-delay:${(greens + i) * 60}ms"></span>`;
        }
        if (!greens && !yellows) {
            html += `<span class="mm-dot mm-dot-empty" title="${mT("mission.mastermind.dotEmpty")}"></span>`;
        }
        return html;
    }

    function renderSlot(colorId, slotIdx, active) {
        const c = colorId ? COLOR_BY_ID[colorId] : null;
        const cls = ["mm-slot", active ? "active" : "", c ? "filled" : ""].filter(Boolean).join(" ");
        const style = c
            ? `--mm-fill:${c.hex};--mm-glow:0 0 12px ${c.hex}88`
            : "";
        return `<button type="button" class="${cls}" style="${style}" data-mm-slot="${slotIdx}" aria-label="${mT("mission.mastermind.slotAria", { n: slotIdx + 1 })}"></button>`;
    }

    function renderLegend() {
        return `<div class="mm-legend">
            <span>${mT("mission.mastermind.legendGreen")}</span>
            <span>${mT("mission.mastermind.legendYellow")}</span>
        </div>`;
    }

    function renderWarning(guessesLeft) {
        if (guessesLeft > 2) return "";
        const urgent = guessesLeft <= 1;
        return `<p class="mm-warn${urgent ? " mm-warn-urgent" : ""}">${
            urgent
                ? mT("mission.mastermind.warnUrgent")
                : mT("mission.mastermind.warnLow", { n: guessesLeft })
        }</p>`;
    }

    function render(game, idx, locked, helpers) {
        migrate(game);
        const { escapeHtml } = helpers;
        const guessesLeft = game.maxGuesses - game.guesses.length;
        const freshRow = game.lastFeedbackAt && (Date.now() - game.lastFeedbackAt < 1200);
        const history = game.guesses.map((row, ri) => {
            const isLatest = freshRow && ri === game.guesses.length - 1;
            const chips = row.guess.map(id => {
                const c = COLOR_BY_ID[id];
                return `<span class="mm-chip" style="background:${c.hex}" title="${colorLabel(id)}"></span>`;
            }).join("");
            return `<div class="mm-history-row${isLatest ? " mm-row-fresh" : ""}">
                <div class="mm-history-guess">${chips}</div>
                <div class="mm-history-feedback">${renderDots(row.greens, row.yellows, isLatest)}</div>
            </div>`;
        }).join("");

        const palette = !game.solved && !locked
            ? `<div class="mm-palette">${COLORS.map(c =>
                `<button type="button" class="mm-color-btn" data-mm-color="${c.id}" data-mm-idx="${idx}" ` +
                `style="--mm-fill:${c.hex}" title="${colorLabel(c.id)}"></button>`
            ).join("")}</div>`
            : "";

        const pickRow = !game.solved && !locked
            ? `${renderLegend()}
            ${renderWarning(guessesLeft)}
            <div class="mm-pick-row">${game.currentPick.map((id, si) =>
                renderSlot(id, si, game.activeSlot === si)
            ).join("")}</div>
            <div class="mm-actions">
                <button type="button" class="secondary" data-mm-clear="${idx}">${mT("mission.mastermind.btnClear")}</button>
                <button type="button" class="green" data-mm-submit="${idx}">${mT("mission.mastermind.btnSubmit")}</button>
            </div>
            <p class="muted mm-meta">${mT("mission.mastermind.meta", { left: guessesLeft, mistakes: game.mistakes || 0 })}</p>`
            : "";

        return `
            <div class="mini-game-card ${game.solved ? "solved" : ""} ${locked ? "locked" : ""}" id="miniGame${idx}">
                <h3>${game.solved ? "✅" : "🎨"} ${escapeHtml(game.title)}</h3>
                <p class="muted">${mT("mission.mastermind.desc")}</p>
                ${pickRow}
                ${palette}
                ${game.guesses.length ? `<div class="mm-history">${history}</div>` : ""}
                ${game.solved
                    ? `<div class="reveal">${mT("mission.common.keyFragment")}<strong>${escapeHtml(game.reveal)}</strong></div>
                       <details class="agent-note-fold"><summary>${mT("mission.common.agentNote")}</summary><p class="agent-note">${escapeHtml(game.agentNote || "")}</p></details>`
                    : locked ? `<p class="muted">${mT("mission.common.lockedPrev")}</p>` : ""}
            </div>`;
    }

    global.MissionMastermind = {
        COLORS,
        COLOR_BY_ID,
        generate,
        migrate,
        evaluateGuess,
        pickColor,
        clearPick,
        submitGuess,
        render
    };
})(typeof window !== "undefined" ? window : globalThis);
