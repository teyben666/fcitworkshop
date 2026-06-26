/**
 * Post-mission finale — classic fragment order OR Stroop ink-color order.
 */
(function (global) {
    const BADGES = ["①", "②", "③"];
    const FINALE_MODES = ["classic", "stroop"];

    const INK_COLORS = [
        { id: "yellow", label: "黄", hex: "#eab308" },
        { id: "red", label: "红", hex: "#ef4444" },
        { id: "green", label: "绿", hex: "#22c55e" }
    ];

    const WORD_LABELS = ["红", "黄", "绿"];

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

    function pickFinaleMode(seedStr) {
        const h = hashSeed(`${seedStr}|finaleMode`);
        return FINALE_MODES[h % FINALE_MODES.length];
    }

    function buildTargetSequence(seedStr) {
        return seededShuffle([...INK_COLORS], hashSeed(`${seedStr}|targetSeq`));
    }

    function buildStroopCards(segments, seedStr) {
        const texts = (segments || []).slice(0, 3);
        while (texts.length < 3) texts.push("?");
        const inkPool = seededShuffle([...INK_COLORS], hashSeed(`${seedStr}|ink`));
        const wordPool = seededShuffle([...WORD_LABELS], hashSeed(`${seedStr}|word`));
        return texts.map((text, id) => ({
            id,
            badge: BADGES[id],
            text,
            word: wordPool[id],
            ink: inkPool[id]
        }));
    }

    function buildClassicCards(segments) {
        const texts = (segments || []).slice(0, 3);
        while (texts.length < 3) texts.push("?");
        return texts.map((text, id) => ({
            id,
            badge: BADGES[id],
            text
        }));
    }

    function isValidInk(ink) {
        return !!(ink && ink.id && ink.hex && /^#[0-9a-fA-F]{6}$/.test(ink.hex));
    }

    function targetSequenceLabel(seq) {
        return (seq || []).map(i => i.label).join(" → ");
    }

    function targetSequenceLabelHtml(seq, arrowHtml) {
        const arrow = arrowHtml || '<span class="fs-stroop-arrow">→</span>';
        return (seq || []).map((i, idx) => {
            const sep = idx > 0 ? ` ${arrow} ` : "";
            return `${sep}<span class="fs-stroop-target-label" style="color:${i.hex}">${i.label}</span>`;
        }).join("");
    }

    function create(segments, seedStr) {
        const seed = seedStr || "finale";
        const mode = pickFinaleMode(seed);
        const targetSequence = mode === "stroop" ? buildTargetSequence(seed) : null;
        const cards = mode === "stroop"
            ? buildStroopCards(segments, seed)
            : buildClassicCards(segments);
        let order = seededShuffle([0, 1, 2], hashSeed(seed));
        const correct = (cid, pos) => {
            if (mode === "stroop") {
                return cards[cid]?.ink?.id === targetSequence[pos]?.id;
            }
            return cards[cid]?.badge === BADGES[pos];
        };
        if (order.every((cid, i) => correct(cid, i))) {
            order = [order[1], order[0], order[2]];
        }
        return {
            kind: "finale",
            solved: false,
            mistakes: 0,
            cards,
            order,
            dragFrom: null,
            hintShown: false,
            mode,
            targetSequence
        };
    }

    function ensureCardFields(finale, seedStr) {
        if (!finale.cards?.length) return;
        const seed = seedStr || "finale";
        if (finale.mode === "stroop") {
            if (!finale.targetSequence?.length) {
                finale.targetSequence = buildTargetSequence(seed);
            }
            const built = buildStroopCards(finale.cards.map(c => c.text), seed);
            finale.cards.forEach((card, id) => {
                if (!card.badge) card.badge = BADGES[id];
                card.ink = built[id].ink;
                card.word = built[id].word;
                if (!isValidInk(card.ink)) {
                    card.ink = built[id].ink;
                }
            });
        } else {
            finale.cards.forEach((card, id) => {
                if (!card.badge) card.badge = BADGES[id];
            });
        }
    }

    function migrate(finale, seedStr) {
        if (!finale || finale.kind !== "finale") return;
        if (!Array.isArray(finale.cards) || finale.cards.length !== 3) {
            finale.cards = BADGES.map((badge, id) => ({
                id,
                badge,
                text: finale.cards?.[id]?.text || "?"
            }));
        }
        if (!finale.mode) {
            finale.mode = finale.cards[0]?.ink ? "stroop" : pickFinaleMode(seedStr || "finale");
        }
        ensureCardFields(finale, seedStr);
        if (!Array.isArray(finale.order) || finale.order.length !== 3) {
            finale.order = [0, 1, 2];
        }
        if (typeof finale.mistakes !== "number") finale.mistakes = 0;
    }

    function isCorrectOrder(finale, seedStr) {
        migrate(finale, seedStr);
        if (finale.mode === "stroop") {
            const seq = finale.targetSequence || INK_COLORS;
            return finale.order.every((cardId, pos) =>
                finale.cards[cardId]?.ink?.id === seq[pos]?.id
            );
        }
        return finale.order.every((cardId, pos) => finale.cards[cardId]?.badge === BADGES[pos]);
    }

    function getCombinedPassword(finale, seedStr) {
        migrate(finale, seedStr);
        return BADGES.map(badge => {
            const card = finale.cards.find(c => c.badge === badge);
            return card?.text || "";
        }).join("");
    }

    function firstTargetCardId(finale) {
        if (finale.mode !== "stroop") {
            return finale.cards.findIndex(c => c.badge === "①");
        }
        const want = finale.targetSequence?.[0]?.id;
        return finale.cards.findIndex(c => c.ink?.id === want);
    }

    function moveCard(finale, fromIdx, toIdx) {
        if (!finale || finale.solved || fromIdx === toIdx) return;
        if (fromIdx < 0 || toIdx < 0 || fromIdx >= finale.order.length || toIdx >= finale.order.length) return;
        const next = [...finale.order];
        const [item] = next.splice(fromIdx, 1);
        next.splice(toIdx, 0, item);
        finale.order = next;
    }

    function lockOrder(finale, seedStr) {
        if (!finale || finale.solved) return { ok: false };
        if (isCorrectOrder(finale, seedStr)) {
            return { ok: true, win: true, password: getCombinedPassword(finale, seedStr) };
        }
        finale.mistakes = (finale.mistakes || 0) + 1;
        const hint = finale.mistakes >= 2 && !finale.hintShown;
        if (hint) {
            finale.hintShown = true;
            const firstId = firstTargetCardId(finale);
            const pos = finale.order.indexOf(firstId);
            if (pos > 0) moveCard(finale, pos, 0);
        }
        return { ok: true, win: false, hint };
    }

    function renderClassic(finale, helpers) {
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
                <p class="muted">三段情报已截获。拖动片段，让角标从左到右为 <strong>① ② ③</strong>，然后确认组合。</p>
                <div class="fs-row" data-finale-row="1">${cardsHtml}</div>
                ${!finale.solved ? `<div class="fs-actions">
                    <button type="button" class="green" data-finale-lock="1">确认组合 · 解锁金库</button>
                    <span class="muted">失误 ${finale.mistakes || 0} 次${finale.hintShown ? " · 已提示①位置" : ""}</span>
                </div>` : `<p class="notice success">密钥已合成，金库已解锁。</p>`}
            </div>`;
    }

    function renderStroop(finale, helpers) {
        const { escapeHtml } = helpers;
        const seq = finale.targetSequence || INK_COLORS;
        const seqHtml = targetSequenceLabelHtml(seq);
        const firstInk = seq[0]?.label || "黄";
        const cardsHtml = finale.order.map((cardId, pos) => {
            const card = finale.cards[cardId];
            const hintClass = finale.hintShown && card.ink?.id === seq[0]?.id ? " fs-hint" : "";
            const ink = card.ink || INK_COLORS[0];
            const congruent = card.word === ink.label;
            return `<div class="fs-card stroop-card${hintClass}${congruent ? " stroop-congruent" : ""}" draggable="${!finale.solved}" data-finale-pos="${pos}">
                <div class="fs-stroop-word" style="color:${ink.hex}">${escapeHtml(card.word || "?")}</div>
                <div class="fs-text fs-frag">${escapeHtml(card.text)}</div>
            </div>`;
        }).join("");
        return `
            <div class="mini-game-card finale-card stroop-finale" id="miniGameFinale">
                <h3>${finale.solved ? "✅" : "🔥"} 数据熔炉 · 抗干扰校验</h3>
                <p class="muted">字是诱饵！<strong>别看字写什么</strong>，只看<strong>字体颜色</strong>，本局从左到右排成：</p>
                <p class="fs-stroop-target"><strong>${seqHtml}</strong></p>
                <p class="muted fs-stroop-example">例：字写「红」但字体是黄色 → 这一格算<strong>黄</strong>。字和颜色一样时仍按颜色排，别偷懒读字。</p>
                <div class="fs-row" data-finale-row="1">${cardsHtml}</div>
                ${!finale.solved ? `<div class="fs-actions">
                    <button type="button" class="green" data-finale-lock="1">确认颜色顺序 · 解锁金库</button>
                    <span class="muted">失误 ${finale.mistakes || 0} 次${finale.hintShown ? ` · 已提示第一格（${firstInk}）` : ""}</span>
                </div>` : `<p class="notice success">熔炉校验通过：①②③ 片段已合成，金库已解锁。</p>`}
            </div>`;
    }

    function render(finale, helpers, seedStr) {
        migrate(finale, seedStr);
        if (finale.mode === "stroop") return renderStroop(finale, helpers);
        return renderClassic(finale, helpers);
    }

    global.MissionFinale = {
        BADGES,
        FINALE_MODES,
        INK_COLORS,
        create,
        migrate,
        isCorrectOrder,
        getCombinedPassword,
        moveCard,
        lockOrder,
        render,
        pickFinaleMode,
        buildTargetSequence,
        targetSequenceLabel,
        targetSequenceLabelHtml,
        isValidInk
    };
})(typeof window !== "undefined" ? window : globalThis);
