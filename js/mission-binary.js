/**
 * Binary bulb mini-game — 4 bulbs (0–15), 3 correct rounds to pass.
 */
(function (global) {
    function hashSeed(str) {
        return global.MissionGames?.hashSeed?.(str) ?? 1;
    }

    function seededInt(seed, min, max) {
        const s = hashSeed(String(seed));
        return min + (s % (max - min + 1));
    }

    function toBulbs(n) {
        const v = Math.max(0, Math.min(15, n | 0));
        const bits = [];
        for (let i = 3; i >= 0; i--) bits.push((v >> i) & 1);
        return bits;
    }

    function pickChoices(correct, seedStr) {
        const set = new Set([correct]);
        let salt = 0;
        while (set.size < 4) {
            const n = seededInt(`${seedStr}|${salt++}`, 0, 15);
            set.add(n);
        }
        const arr = [...set];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = seededInt(`${seedStr}|swap|${i}`, 0, i);
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    function nextRound(game, seedStr) {
        const value = seededInt(`${seedStr}|r${game.round}`, 0, 15);
        game.value = value;
        game.bulbs = toBulbs(value);
        game.choices = pickChoices(value, `${seedStr}|c${game.round}`);
    }

    function generate(fragment, ctx) {
        const seedStr = `${ctx?.password || ""}|${fragment}|binary|${ctx?.target?.id || ""}`;
        const game = {
            kind: "binary",
            title: "机器人密语 · 二进制灯泡",
            solved: false,
            mistakes: 0,
            round: 0,
            roundsNeeded: 3,
            value: 0,
            bulbs: [0, 0, 0, 0],
            choices: [],
            reveal: fragment,
            agentNote: "特工笔记：亮灯=1，灭灯=0。四位灯泡合起来就是 0～15 的数字，机器人只懂这种语言！"
        };
        nextRound(game, seedStr);
        game._seedStr = seedStr;
        return game;
    }

    function migrate(game) {
        if (!game || game.kind !== "binary") return;
        if (typeof game.round !== "number") game.round = 0;
        if (typeof game.mistakes !== "number") game.mistakes = 0;
        if (!Array.isArray(game.bulbs)) game.bulbs = toBulbs(game.value || 0);
    }

    function pickAnswer(game, choice) {
        if (!game || game.solved) return { ok: false };
        const n = Number(choice);
        if (!Number.isFinite(n) || n < 0 || n > 15) return { ok: false };
        if (n === game.value) {
            game.round += 1;
            if (game.round >= game.roundsNeeded) {
                return { ok: true, win: true };
            }
            nextRound(game, game._seedStr || "binary");
            return { ok: true, win: false, nextRound: true };
        }
        game.mistakes = (game.mistakes || 0) + 1;
        nextRound(game, `${game._seedStr || "binary"}|miss${game.mistakes}`);
        return { ok: true, win: false, wrong: true };
    }

    function renderBulbs(bulbs) {
        return bulbs.map(on =>
            `<span class="binary-bulb ${on ? "on" : "off"}" aria-hidden="true">${on ? "💡" : "⚫"}</span>`
        ).join("");
    }

    function render(game, idx, locked, helpers) {
        migrate(game);
        const { escapeHtml } = helpers;
        const prog = `${Math.min(game.round, game.roundsNeeded)}/${game.roundsNeeded}`;
        const choicesHtml = (game.choices || []).map(n =>
            `<button type="button" class="binary-choice-btn" data-binary-pick="${idx}" data-binary-val="${n}">${n}</button>`
        ).join("");

        return `
            <div class="mini-game-card ${game.solved ? "solved" : ""} ${locked ? "locked" : ""}" id="miniGame${idx}">
                <h3>${game.solved ? "✅" : "🤖"} ${escapeHtml(game.title)}</h3>
                <p class="muted">老式机器人守卫只懂灯泡语言：亮=1，灭=0。读出四位二进制对应的数字（0～15）。</p>
                ${game.solved
                    ? `<div class="reveal">密钥片段：<strong>${escapeHtml(game.reveal)}</strong></div>
                       <div class="agent-note">${escapeHtml(game.agentNote || "")}</div>`
                    : locked ? `<p class="muted">完成上一关后解锁。</p>` : `
                <div class="binary-bulb-row">${renderBulbs(game.bulbs)}</div>
                <p class="binary-hint muted">从左到右读：${game.bulbs.join("")} → 选下方正确数字 · 进度 ${prog}</p>
                <div class="binary-choices">${choicesHtml}</div>
                <p class="muted" style="font-size:.78rem;margin-top:.5rem">失误 ${game.mistakes || 0} 次</p>`}
            </div>`;
    }

    global.MissionBinary = {
        generate,
        migrate,
        pickAnswer,
        render
    };
})(typeof window !== "undefined" ? window : globalThis);
