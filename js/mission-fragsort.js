/**
 * Fragment sort mini-game — drag 5 cards into ①→⑤ order.
 */
(function (global) {
    const BADGES = ["①", "②", "③", "④", "⑤"];

    function mT(k, v) {
        return global.MissionI18n?.mT?.(k, v) ?? k;
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

    function buildChunks(fragment) {
        const raw = (fragment || "VAULTKEY").toUpperCase().replace(/[^A-Z0-9]/g, "");
        const pad = (raw + "XY12ZW34AB").slice(0, 10);
        const chunks = [];
        for (let i = 0; i < 5; i++) {
            chunks.push(pad.slice(i * 2, i * 2 + 2));
        }
        return chunks;
    }

    function generate(fragment, ctx) {
        const chunks = buildChunks(fragment);
        const cards = BADGES.map((badge, id) => ({ id, badge, text: chunks[id] }));
        const seed = hashSeed(`${ctx?.password || ""}|${fragment}|${ctx?.target?.id || ""}`);
        let order = seededShuffle([0, 1, 2, 3, 4], seed);
        if (order.every((cid, i) => cid === i)) {
            order = [order[1], order[0], order[2], order[4], order[3]];
        }
        const reveal = (fragment && fragment.length >= 2)
            ? fragment
            : chunks.join("").slice(0, Math.max(4, (fragment || "").length || 4));
        return {
            kind: "fragsort",
            title: mT("mission.fragsort.title"),
            solved: false,
            mistakes: 0,
            cards,
            order,
            dragFrom: null,
            reveal,
            agentNote: mT("mission.fragsort.desc")
        };
    }

    function migrate(game) {
        if (!game || game.kind !== "fragsort") return;
        if (!Array.isArray(game.cards) || game.cards.length !== 5) {
            const chunks = buildChunks(game.reveal || "KEY");
            game.cards = BADGES.map((badge, id) => ({ id, badge, text: chunks[id] }));
        }
        if (!Array.isArray(game.order) || game.order.length !== 5) {
            game.order = [0, 1, 2, 3, 4];
        }
        if (typeof game.mistakes !== "number") game.mistakes = 0;
        game.title = mT("mission.fragsort.title");
        game.agentNote = mT("mission.fragsort.desc");
    }

    function isCorrectOrder(game) {
        return game.order.every((cardId, pos) => game.cards[cardId]?.badge === BADGES[pos]);
    }

    function moveCard(game, fromIdx, toIdx) {
        if (!game || game.solved || fromIdx === toIdx) return;
        if (fromIdx < 0 || toIdx < 0 || fromIdx >= game.order.length || toIdx >= game.order.length) return;
        const next = [...game.order];
        const [item] = next.splice(fromIdx, 1);
        next.splice(toIdx, 0, item);
        game.order = next;
    }

    function lockOrder(game) {
        if (!game || game.solved) return { ok: false };
        if (isCorrectOrder(game)) {
            return { ok: true, win: true };
        }
        game.mistakes = (game.mistakes || 0) + 1;
        const hint = game.mistakes >= 3 && !game.hintShown;
        if (hint) {
            game.hintShown = true;
            const firstId = game.cards.findIndex(c => c.badge === "①");
            const pos = game.order.indexOf(firstId);
            if (pos > 0) moveCard(game, pos, 0);
        }
        return { ok: true, win: false, hint };
    }

    function render(game, idx, locked, helpers) {
        migrate(game);
        const { escapeHtml } = helpers;
        const cardsHtml = game.order.map((cardId, pos) => {
            const card = game.cards[cardId];
            const hintClass = game.hintShown && card.badge === "①" ? " fs-hint" : "";
            return `<div class="fs-card${hintClass}" draggable="${!game.solved && !locked}" data-fs-idx="${idx}" data-fs-pos="${pos}">
                <span class="fs-badge">${card.badge}</span>
                <span class="fs-text">${escapeHtml(card.text)}</span>
            </div>`;
        }).join("");

        const controls = !game.solved && !locked
            ? `<div class="fs-actions">
                <button type="button" class="green" data-fs-lock="${idx}">${mT("mission.fragsort.lockBtn")}</button>
                <span class="muted">${mT("mission.fragsort.mistakesMeta", { n: game.mistakes || 0 })}${game.hintShown ? ` · ${mT("mission.fragsort.hintShown")}` : ""}</span>
               </div>`
            : "";

        return `
            <div class="mini-game-card ${game.solved ? "solved" : ""} ${locked ? "locked" : ""}" id="miniGame${idx}">
                <h3>${game.solved ? "✅" : "🧩"} ${escapeHtml(game.title)}</h3>
                <p class="muted">${mT("mission.fragsort.desc")}</p>
                <div class="fs-row" data-fs-row="${idx}">${cardsHtml}</div>
                ${controls}
                ${game.solved
                    ? `<div class="reveal">${mT("mission.common.keyFragment")}<strong>${escapeHtml(game.reveal)}</strong></div>
                       <details class="agent-note-fold"><summary>${mT("mission.common.agentNote")}</summary><div class="agent-note">${escapeHtml(game.agentNote || "")}</div></details>`
                    : locked ? `<p class="muted">${mT("mission.common.lockedPrev")}</p>` : ""}
            </div>`;
    }

    global.MissionFragsort = {
        BADGES,
        generate,
        migrate,
        isCorrectOrder,
        moveCard,
        lockOrder,
        render
    };
})(typeof window !== "undefined" ? window : globalThis);
