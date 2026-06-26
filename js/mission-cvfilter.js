/**
 * CV filter reveal — apply preprocessing filters in correct order to expose coordinates.
 */
(function (global) {
    const FILTERS = [
        { id: "invert", label: "负片反转", icon: "⚫", css: "invert(0) hue-rotate(0deg)",
            desc: "把底片反相：暗变亮、亮变暗，先「翻」出轮廓。" },
        { id: "rgb", label: "RGB 还原", icon: "🔴", css: "saturate(1.35) contrast(1.05)",
            desc: "拉回色彩通道，让被压制的红/绿信号重新分离。" },
        { id: "edge", label: "边缘锐化", icon: "🔲", css: "contrast(1.5) brightness(1.08)",
            desc: "锐化边缘，把模糊坐标刻成可读文字。" }
    ];

    const FILTER_BY_ID = Object.fromEntries(FILTERS.map(f => [f.id, f]));
    const BASE_FILTER = "invert(1) hue-rotate(180deg) saturate(0.35) blur(1px)";

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

    function buildCorrectOrder(seedStr) {
        const ids = FILTERS.map(f => f.id);
        let order = seededShuffle(ids, hashSeed(`${seedStr}|order`));
        if (order.join() === ids.join()) {
            order = [order[1], order[0], order[2]];
        }
        return order;
    }

    function composeFilter(appliedIds) {
        if (!appliedIds.length) return BASE_FILTER;
        const parts = [BASE_FILTER];
        appliedIds.forEach(id => {
            const f = FILTER_BY_ID[id];
            if (f) parts.push(f.css);
        });
        return parts.join(" ");
    }

    function expectedFilterId(game) {
        const step = game.applied?.length || 0;
        return game.correctOrder?.[step] || null;
    }

    function expectedFilterLabel(game) {
        const id = expectedFilterId(game);
        return id ? (FILTER_BY_ID[id]?.label || id) : "";
    }

    function stepHint(game) {
        const step = game.applied?.length || 0;
        const next = game.correctOrder?.[step];
        const f = next ? FILTER_BY_ID[next] : null;
        if (!f) return "";
        if ((game.mistakes || 0) >= 2) {
            return `提示：下一步试试「${f.label}」——${f.desc}`;
        }
        if (step === 0) {
            return "第一步：底片太暗，先找能把明暗翻过来的滤镜。";
        }
        if (step === 1) {
            return "第二步：轮廓有了，还差色彩分离——想想哪个滤镜管 RGB。";
        }
        return "最后一步：把坐标刻清楚，需要锐化边缘。";
    }

    function pipelineSteps(game) {
        return (game.correctOrder || []).map((id, i) => {
            const f = FILTER_BY_ID[id];
            const done = game.applied.length > i;
            const active = game.applied.length === i && !game.solved;
            const cls = ["cv-pipe-step", done ? "cv-pipe-done" : "", active ? "cv-pipe-active" : ""]
                .filter(Boolean).join(" ");
            return `<span class="${cls}" title="${f?.desc || ""}">${done ? "✓" : i + 1} ${f?.icon || ""}</span>`;
        }).join('<span class="cv-pipe-arrow">→</span>');
    }

    function generate(fragment, ctx) {
        const target = ctx?.target || {};
        const seedStr = `${ctx?.password || ""}|${fragment}|cv|${target.id || ""}`;
        const stateName = target.state || target.name || "目标州";
        const clue = `GOLD IN ${String(stateName).toUpperCase().slice(0, 12)}`;
        return {
            kind: "cvfilter",
            title: "滤镜显影 · 反转密码",
            solved: false,
            mistakes: 0,
            applied: [],
            correctOrder: buildCorrectOrder(seedStr),
            clue,
            stateLabel: stateName,
            mapImage: "malaysia.png",
            reveal: fragment || "",
            agentNote: "特工笔记：模糊底片要靠预处理管线——反转、色彩、锐化按对顺序，机器才能「看清」隐藏坐标。",
            _seedStr: seedStr
        };
    }

    function migrate(game) {
        if (!game || game.kind !== "cvfilter") return;
        if (!Array.isArray(game.applied)) game.applied = [];
        if (!Array.isArray(game.correctOrder) || game.correctOrder.length !== 3) {
            game.correctOrder = buildCorrectOrder(game._seedStr || "cv");
        }
        if (typeof game.mistakes !== "number") game.mistakes = 0;
        if (!game.clue) game.clue = "COORD LOCKED";
    }

    function applyFilter(game, filterId) {
        if (!game || game.solved) return { ok: false };
        const step = game.applied.length;
        const expected = game.correctOrder[step];
        const picked = FILTER_BY_ID[filterId];
        if (filterId !== expected) {
            game.mistakes = (game.mistakes || 0) + 1;
            return {
                ok: true,
                wrong: true,
                glitch: true,
                expectedLabel: FILTER_BY_ID[expected]?.label || expected,
                pickedLabel: picked?.label || filterId
            };
        }
        game.applied.push(filterId);
        if (game.applied.length >= game.correctOrder.length) {
            return { ok: true, win: true };
        }
        return {
            ok: true,
            step: game.applied.length,
            appliedLabel: picked?.label || filterId
        };
    }

    function revealVisible(game) {
        return game.applied.length >= 1;
    }

    function clueVisible(game) {
        return game.applied.length >= 3 || game.solved;
    }

    function renderTutorial() {
        const items = FILTERS.map(f =>
            `<li><strong>${f.icon} ${f.label}</strong> — ${f.desc}</li>`
        ).join("");
        return `<details class="cv-tutorial" open>
            <summary>预处理管线说明（先读再点）</summary>
            <ul class="cv-tutorial-list">${items}</ul>
            <p class="muted cv-tutorial-foot">顺序因底片而异——三步全对，坐标才会完全显影。</p>
        </details>`;
    }

    function render(game, idx, locked, helpers) {
        migrate(game);
        const { escapeHtml } = helpers;
        const filterCss = composeFilter(game.applied);
        const showClue = clueVisible(game);
        const showReveal = revealVisible(game);
        const hint = stepHint(game);

        const buttons = FILTERS.map(f => {
            const used = game.applied.includes(f.id);
            const isNext = expectedFilterId(game) === f.id && !game.solved && !locked;
            return `<button type="button" class="cv-filter-btn${used ? " cv-used" : ""}${isNext && (game.mistakes || 0) >= 2 ? " cv-hint-glow" : ""}"
                data-cv-filter="${idx}" data-cv-id="${f.id}" title="${escapeHtml(f.desc)}"
                ${used || locked || game.solved ? "disabled" : ""}>
                <span class="cv-filter-icon">${f.icon}</span>${escapeHtml(f.label)}
            </button>`;
        }).join("");

        return `
            <div class="mini-game-card ${game.solved ? "solved" : ""} ${locked ? "locked" : ""}" id="miniGame${idx}">
                <h3>${game.solved ? "✅" : "🛰️"} ${escapeHtml(game.title)}</h3>
                <p class="muted">敌方卫星图被电磁干扰成底片。按<strong>正确预处理顺序</strong>点击滤镜，让隐藏坐标现形。</p>
                ${game.solved
                    ? `<div class="reveal">密钥片段：<strong>${escapeHtml(game.reveal)}</strong></div>
                       <div class="agent-note">${escapeHtml(game.agentNote || "")}</div>`
                    : locked ? `<p class="muted">完成上一关后解锁。</p>` : `
                ${renderTutorial()}
                <div class="cv-pipeline">${pipelineSteps(game)}</div>
                <div class="cv-viewport" id="cvViewport${idx}">
                    <img class="cv-map" src="malaysia.png" alt="" style="filter:${filterCss}" />
                    <div class="cv-clue${showClue ? " cv-clue-show" : ""}">${escapeHtml(game.clue)}</div>
                    ${showReveal ? `<div class="cv-hint cv-hint-live">${escapeHtml(hint)}</div>` : ""}
                </div>
                <div class="cv-filters">${buttons}</div>
                <p class="muted cv-meta">已显影 ${game.applied.length}/3 步 · 失误 ${game.mistakes || 0} 次</p>`}
            </div>`;
    }

    global.MissionCvfilter = {
        FILTERS,
        FILTER_BY_ID,
        generate,
        migrate,
        applyFilter,
        composeFilter,
        expectedFilterId,
        expectedFilterLabel,
        stepHint,
        render
    };
})(typeof window !== "undefined" ? window : globalThis);
