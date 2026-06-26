/**
 * Post-mission finale — sort 3 password segments (①②③) then unlock vault.
 */
(function (global) {
    const BADGES = ["①", "②", "③"];

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

    function create(segments, seedStr) {
        const texts = (segments || []).slice(0, 3);
        while (texts.length < 3) texts.push("?");
        const cards = texts.map((text, id) => ({ id, badge: BADGES[id], text }));
        let order = seededShuffle([0, 1, 2], hashSeed(seedStr || "finale"));
        if (order.every((cid, i) => cid === i)) {
            order = [order[1], order[0], order[2]];
        }
        return {
            kind: "finale",
            solved: false,
            mistakes: 0,
            cards,
            order,
            dragFrom: null,
            hintShown: false
        };
    }

    function migrate(finale) {
        if (!finale || finale.kind !== "finale") return;
        if (!Array.isArray(finale.cards) || finale.cards.length !== 3) {
            finale.cards = BADGES.map((badge, id) => ({
                id,
                badge,
                text: finale.cards?.[id]?.text || "?"
            }));
        }
        if (!Array.isArray(finale.order) || finale.order.length !== 3) {
            finale.order = [0, 1, 2];
        }
        if (typeof finale.mistakes !== "number") finale.mistakes = 0;
    }

    function isCorrectOrder(finale) {
        return finale.order.every((cardId, pos) => finale.cards[cardId]?.badge === BADGES[pos]);
    }

    function getCombinedPassword(finale) {
        migrate(finale);
        return BADGES.map((_, pos) => {
            const cardId = finale.order[pos];
            return finale.cards[cardId]?.text || "";
        }).join("");
    }

    function moveCard(finale, fromIdx, toIdx) {
        if (!finale || finale.solved || fromIdx === toIdx) return;
        if (fromIdx < 0 || toIdx < 0 || fromIdx >= finale.order.length || toIdx >= finale.order.length) return;
        const next = [...finale.order];
        const [item] = next.splice(fromIdx, 1);
        next.splice(toIdx, 0, item);
        finale.order = next;
    }

    function lockOrder(finale) {
        if (!finale || finale.solved) return { ok: false };
        if (isCorrectOrder(finale)) {
            return { ok: true, win: true, password: getCombinedPassword(finale) };
        }
        finale.mistakes = (finale.mistakes || 0) + 1;
        const hint = finale.mistakes >= 2 && !finale.hintShown;
        if (hint) {
            finale.hintShown = true;
            const firstId = finale.cards.findIndex(c => c.badge === "①");
            const pos = finale.order.indexOf(firstId);
            if (pos > 0) moveCard(finale, pos, 0);
        }
        return { ok: true, win: false, hint };
    }

    function render(finale, helpers) {
        migrate(finale);
        const { escapeHtml } = helpers;
        const cardsHtml = finale.order.map((cardId, pos) => {
            const card = finale.cards[cardId];
            const hintClass = finale.hintShown && card.badge === "①" ? " fs-hint" : "";
            return `<div class="fs-card${hintClass}" draggable="${!finale.solved}" data-finale-pos="${pos}">
                <span class="fs-badge">${card.badge}</span>
                <span class="fs-text">${escapeHtml(card.text)}</span>
            </div>`;
        }).join("");

        return `
            <div class="mini-game-card finale-card" id="miniGameFinale">
                <h3>${finale.solved ? "✅" : "🔐"} 组合金库密钥</h3>
                <p class="muted">三段情报已截获。拖动片段，让角标从左到右为 ① ② ③，然后确认组合。</p>
                <div class="fs-row" data-finale-row="1">${cardsHtml}</div>
                ${!finale.solved ? `<div class="fs-actions">
                    <button type="button" class="green" data-finale-lock="1">确认组合 · 解锁金库</button>
                    <span class="muted">失误 ${finale.mistakes || 0} 次${finale.hintShown ? " · 已提示①位置" : ""}</span>
                </div>` : `<p class="notice success">金库已解锁，请确认转账。</p>`}
            </div>`;
    }

    global.MissionFinale = {
        BADGES,
        create,
        migrate,
        isCorrectOrder,
        getCombinedPassword,
        moveCard,
        lockOrder,
        render
    };
})(typeof window !== "undefined" ? window : globalThis);
