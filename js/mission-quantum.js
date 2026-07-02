/**
 * Quantum sync — 3×3 Simon-style sequence memory (3 → 4 → 5 cells).
 */
(function (global) {
    const GRID = 3;
    const CELL_COUNT = 9;
    const ROUND_LENGTHS = [3, 4, 5];
    const CELL_COLORS = [
        "#38bdf8", "#34d399", "#fbbf24",
        "#f472b6", "#a78bfa", "#fb923c",
        "#2dd4bf", "#f87171", "#94a3b8"
    ];

    function mT(key, vars) {
        return global.MissionI18n?.mT?.(key, vars) ?? key;
    }

    function hashSeed(str) {
        return global.MissionGames?.hashSeed?.(str) ?? 1;
    }

    function seededInt(seed, min, max) {
        const s = hashSeed(String(seed));
        return min + (s % (max - min + 1));
    }

    function buildSequence(seedStr, len) {
        const seq = [];
        for (let i = 0; i < len; i++) {
            seq.push(seededInt(`${seedStr}|${i}`, 0, CELL_COUNT - 1));
        }
        return seq;
    }

    function generate(fragment, ctx) {
        const seedStr = `${ctx?.password || ""}|${fragment}|quantum|${ctx?.target?.id || ""}|${ctx?.deploySeq ?? 0}`;
        const sequences = ROUND_LENGTHS.map((len, r) =>
            buildSequence(`${seedStr}|r${r}`, len)
        );
        return {
            kind: "quantum",
            title: mT("mission.quantum.title"),
            solved: false,
            mistakes: 0,
            round: 0,
            sequences,
            phase: "ready",
            flashIndex: -1,
            inputIndex: 0,
            countdown: 3,
            _seedStr: seedStr,
            reveal: fragment || "",
            agentNote: mT("mission.quantum.agentNote")
        };
    }

    function migrate(game) {
        if (!game || game.kind !== "quantum") return;
        if (!Array.isArray(game.sequences) || game.sequences.length !== 3) {
            const seed = game._seedStr || "quantum";
            game.sequences = ROUND_LENGTHS.map((len, r) => buildSequence(`${seed}|r${r}`, len));
        }
        if (typeof game.round !== "number") game.round = 0;
        if (typeof game.mistakes !== "number") game.mistakes = 0;
        if (!game.phase) game.phase = "ready";
        if (typeof game.inputIndex !== "number") game.inputIndex = 0;
        game.title = mT("mission.quantum.title");
        game.agentNote = mT("mission.quantum.agentNote");
    }

    function currentSequence(game) {
        return game.sequences?.[game.round] || [];
    }

    function tapCell(game, cellIdx) {
        if (!game || game.solved || game.phase !== "input") return { ok: false };
        const seq = currentSequence(game);
        const expected = seq[game.inputIndex];
        if (cellIdx === expected) {
            game.inputIndex += 1;
            if (game.inputIndex >= seq.length) {
                if (game.round + 1 >= ROUND_LENGTHS.length) {
                    return { ok: true, win: true };
                }
                game.round += 1;
                game.inputIndex = 0;
                game.phase = "round_done";
                return { ok: true, roundComplete: true };
            }
            return { ok: true, correct: true };
        }
        game.mistakes = (game.mistakes || 0) + 1;
        game.inputIndex = 0;
        game.phase = "wrong";
        return { ok: true, wrong: true };
    }

    function beginShowPhase(game) {
        if (!game || game.solved) return;
        game.phase = "show";
        game.flashIndex = -1;
        game.inputIndex = 0;
    }

    function beginInputPhase(game) {
        if (!game || game.solved) return;
        game.phase = "input";
        game.inputIndex = 0;
    }

    function cellColor(idx) {
        return CELL_COLORS[idx % CELL_COLORS.length];
    }

    function renderGrid(game, locked) {
        const inputPhase = game.phase === "input" && !locked;
        let html = "";
        for (let i = 0; i < CELL_COUNT; i++) {
            const lit = (game.phase === "show" && game.flashIndex === i)
                || game._tapFlash === i;
            const color = cellColor(i);
            const cls = [
                "qx-cell",
                lit ? "qx-lit" : "qx-idle",
                inputPhase ? "qx-input" : ""
            ].filter(Boolean).join(" ");
            const style = lit ? ` style="background:${color}"` : "";
            const aria = mT("mission.quantum.nodeAria", { n: i + 1 });
            html += `<div class="${cls}" data-qx-cell="${i}" data-qx-color="${color}" role="button"`
                + ` tabindex="${inputPhase ? "0" : "-1"}" aria-label="${aria}"`
                + ` aria-disabled="${inputPhase ? "false" : "true"}"${style}></div>`;
        }
        return `<div class="qx-grid">${html}</div>`;
    }

    function applyCellState(game, cellEl, cellIdx) {
        if (!cellEl || !game) return;
        const inputPhase = game.phase === "input";
        const lit = (game.phase === "show" && game.flashIndex === cellIdx)
            || game._tapFlash === cellIdx;
        const color = cellColor(cellIdx);
        cellEl.className = [
            "qx-cell",
            lit ? "qx-lit" : "qx-idle",
            inputPhase ? "qx-input" : ""
        ].filter(Boolean).join(" ");
        cellEl.style.background = lit ? color : "#0a0a0a";
        cellEl.tabIndex = inputPhase ? 0 : -1;
        cellEl.setAttribute("aria-disabled", inputPhase ? "false" : "true");
        cellEl.setAttribute("aria-label", mT("mission.quantum.nodeAria", { n: cellIdx + 1 }));
    }

    function syncGridElement(gridRoot, game) {
        if (!gridRoot || !game) return false;
        const cells = gridRoot.querySelectorAll("[data-qx-cell]");
        if (cells.length !== CELL_COUNT) return false;
        cells.forEach(el => {
            const idx = Number(el.dataset.qxCell);
            if (Number.isFinite(idx)) applyCellState(game, el, idx);
        });
        return true;
    }

    function phaseLabel(game) {
        if (game.solved) return "";
        if (game.phase === "ready" || game.phase === "countdown") return mT("mission.quantum.phaseReady");
        if (game.phase === "show") return mT("mission.quantum.phaseShow");
        if (game.phase === "input") {
            const total = currentSequence(game).length;
            return mT("mission.quantum.phaseInput", {
                cur: Math.min(game.inputIndex + 1, total),
                total
            });
        }
        if (game.phase === "wrong") return mT("mission.quantum.phaseWrong");
        if (game.phase === "round_done") return mT("mission.quantum.roundDone", { n: game.round });
        return "";
    }

    function render(game, idx, locked, helpers) {
        migrate(game);
        const { escapeHtml } = helpers;
        const roundLabel = game.solved
            ? mT("mission.common.complete")
            : mT("mission.quantum.roundLabel", {
                cur: game.round + 1,
                total: ROUND_LENGTHS.length,
                nodes: ROUND_LENGTHS[game.round]
            });

        return `
            <div class="mini-game-card ${game.solved ? "solved" : ""} ${locked ? "locked" : ""}" id="miniGame${idx}">
                <h3>${game.solved ? "✅" : "⚛️"} ${escapeHtml(game.title)}</h3>
                <p class="muted">${mT("mission.quantum.desc", { roundLabel })}</p>
                ${game.solved
                    ? `<div class="reveal">${mT("mission.common.keyFragment")}<strong>${escapeHtml(game.reveal)}</strong></div>
                       <details class="agent-note-fold"><summary>${mT("mission.common.agentNote")}</summary><div class="agent-note">${escapeHtml(game.agentNote || "")}</div></details>`
                    : locked ? `<p class="muted">${mT("mission.common.lockedPrev")}</p>` : `
                <p class="qx-phase" id="qxPhase${idx}">${escapeHtml(phaseLabel(game))}</p>
                ${renderGrid(game, locked)}
                <div class="qx-actions">
                    ${game.phase === "ready" || game.phase === "wrong" || game.phase === "round_done"
                        ? `<button type="button" class="green" data-qx-start="${idx}">${mT("mission.quantum.startBtn")}</button>` : ""}
                </div>
                <p class="muted qx-meta">${mT("mission.quantum.meta", {
                    mistakes: game.mistakes || 0,
                    cur: Math.min(game.round + (game.phase === "round_done" ? 1 : 0), ROUND_LENGTHS.length)
                })}</p>`}
            </div>`;
    }

    global.MissionQuantum = {
        GRID,
        CELL_COUNT,
        ROUND_LENGTHS,
        generate,
        migrate,
        tapCell,
        beginShowPhase,
        beginInputPhase,
        currentSequence,
        phaseLabel,
        cellColor,
        applyCellState,
        syncGridElement,
        render
    };
})(typeof window !== "undefined" ? window : globalThis);
