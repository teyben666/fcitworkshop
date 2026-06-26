/**
 * Reading intel mini-game — central bank Bonus only (not in mission pool).
 * Terminal UI with left-to-right decryption scramble.
 */
(function (global) {
    const LINE_DECODE_MS = 320;
    const SCRAMBLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%█▓░▒";

    const EMBEDDED_BRIEFINGS = [
        {
            id: "brief-01",
            title: "敌方资金调动通知",
            lines: [
                "【绝密 · 内部转发】",
                "致各州金库值班员：请于 14:30 前将备用现金 RM 12,000 转入账号尾号 8842。",
                "核验口令为「晨雾-7」，转账备注写「设备维护」。",
                "逾期将触发二级审计，请勿回复本邮件。",
                "—— 行动组 B · 吉隆坡"
            ],
            questions: [
                { prompt: "要求在什么时间前完成转账？", choices: ["12:00", "14:30", "16:00"], answer: 1 },
                { prompt: "转账备注应写什么？", choices: ["紧急调拨", "设备维护", "年终结算"], answer: 1 },
                { prompt: "核验口令是？", choices: ["晨雾-7", "夜航-3", "红树-9"], answer: 0 }
            ]
        },
        {
            id: "brief-02",
            title: "沙巴港口截获电报",
            lines: [
                "截获时间：09:17 · 来源：KK 港区中继站",
                "目标船只「海鹭号」将于今晚 22:00 离港。",
                "船上密封箱编号 SB-441，内装 RM 8,500 现钞。",
                "交接暗号为「椰风向西」，接头人穿藏青工装。",
                "请沿岸监视组确认箱号后回报。"
            ],
            questions: [
                { prompt: "「海鹭号」计划何时离港？", choices: ["20:00", "22:00", "午夜 0:00"], answer: 1 },
                { prompt: "密封箱编号是？", choices: ["SB-114", "SB-441", "SB-908"], answer: 1 },
                { prompt: "交接暗号是？", choices: ["椰风向西", "东风过境", "蓝湾待命"], answer: 0 }
            ]
        },
        {
            id: "brief-03",
            title: "槟城 ATM 补给指令",
            lines: [
                "槟城北区 ATM 集群将于周三维护。",
                "需提前注入 RM 25,000，分五趟运送，每趟 RM 5,000。",
                "首趟发车时间 07:45，车牌尾号 73。",
                "押运员识别码：PG-NORTH-12。",
                "异常状况联系值班长分机 402。"
            ],
            questions: [
                { prompt: "总补给金额是多少？", choices: ["RM 15,000", "RM 25,000", "RM 35,000"], answer: 1 },
                { prompt: "首趟发车时间是？", choices: ["06:30", "07:45", "08:15"], answer: 1 },
                { prompt: "押运员识别码？", choices: ["PG-SOUTH-08", "PG-NORTH-12", "PG-CENTRAL-03"], answer: 1 }
            ]
        }
    ];

    let briefings = null;
    const ready = Promise.resolve().then(() => {
        briefings = (global.INTEL_BRIEFINGS?.length
            ? global.INTEL_BRIEFINGS
            : EMBEDDED_BRIEFINGS);
    });

    function hashSeed(str) {
        return global.MissionGames?.hashSeed?.(str)
            ?? global.CurrencySafeRoomShared?.hashSeed?.(str)
            ?? 1;
    }

    function listBriefings() {
        return briefings?.length ? briefings : EMBEDDED_BRIEFINGS;
    }

    function pickBriefing(seedStr) {
        const pool = listBriefings();
        const idx = hashSeed(seedStr) % pool.length;
        return JSON.parse(JSON.stringify(pool[idx]));
    }

    function scrambleChar(seed) {
        return SCRAMBLE[Math.abs(seed) % SCRAMBLE.length];
    }

    function decodeLine(target, progress, tick) {
        const locked = Math.floor(target.length * Math.min(1, Math.max(0, progress)));
        return [...target].map((ch, i) => {
            if (i < locked) return ch;
            if (ch === " " || ch === "\u3000") return " ";
            return scrambleChar(tick + i * 31 + target.charCodeAt(i));
        }).join("");
    }

    function createSession(ctx) {
        const briefing = pickBriefing(ctx.briefingSeed || "bonus");
        const now = Date.now();
        return {
            kind: "intelread",
            briefing,
            step: "read",
            decodeStartedAt: now,
            displayedLines: [],
            currentQ: 0,
            wrongCount: 0,
            lastWrongQ: -1,
            pool: ctx.pool || 0,
            startedAt: ctx.startedAt || now,
            practiceOnly: !!ctx.practiceOnly,
            waveIndex: ctx.waveIndex ?? 0,
            briefingSeed: ctx.briefingSeed
        };
    }

    function tickDecode(session, nowMs) {
        if (!session || session.step !== "read") return false;
        const now = Number(nowMs) || Date.now();
        if (!session.decodeStartedAt) session.decodeStartedAt = now;
        const elapsed = now - session.decodeStartedAt;
        const tick = Math.floor(now / 55);
        const lines = session.briefing.lines || [];
        const lineCount = lines.length;
        const activeLine = Math.min(lineCount, Math.floor(elapsed / LINE_DECODE_MS));
        const posInLine = elapsed - activeLine * LINE_DECODE_MS;
        const lineProgress = Math.min(1, posInLine / LINE_DECODE_MS);

        session.decodeLineIndex = activeLine;

        if (activeLine >= lineCount) {
            session.step = "quiz";
            session.displayedLines = [...lines];
            return true;
        }

        session.displayedLines = lines.map((line, i) => {
            if (i < activeLine) return line;
            if (i === activeLine) return decodeLine(line, lineProgress, tick);
            return decodeLine(line, 0, tick + i * 17);
        });
        return true;
    }

    function skipToQuiz(session) {
        if (!session) return;
        session.step = "quiz";
        session.displayedLines = [...(session.briefing.lines || [])];
    }

    function computeRemainder(session, nowMs) {
        const S = global.CurrencySafeRoomShared;
        const pool = session?.pool || 0;
        if (!S?.computeBonusPayout) return pool;
        return S.computeBonusPayout(
            pool,
            session.startedAt,
            nowMs || Date.now(),
            session.wrongCount || 0
        );
    }

    function submitAnswer(session, choiceIdx) {
        if (!session || session.step !== "quiz") return { ok: false, reason: "not_quiz" };
        const q = session.briefing.questions[session.currentQ];
        if (!q) return { ok: false, reason: "no_question" };
        const pick = Number(choiceIdx);
        if (pick !== q.answer) {
            session.wrongCount = (session.wrongCount || 0) + 1;
            session.lastWrongQ = session.currentQ;
            return { ok: false, wrong: true, wrongCount: session.wrongCount };
        }
        session.lastWrongQ = -1;
        session.currentQ++;
        if (session.currentQ >= session.briefing.questions.length) {
            session.step = "done";
            return { ok: true, complete: true, wrongCount: session.wrongCount || 0 };
        }
        return { ok: true, next: true };
    }

    function renderReadBody(session) {
        const lines = session.briefing.lines || [];
        const decrypting = session.step === "read";
        return lines.map((full, i) => {
            const text = session.displayedLines[i] != null
                ? session.displayedLines[i]
                : (decrypting ? decodeLine(full, 0, 0) : full);
            const prefix = i === 0 ? '<span class="ir-prompt">$</span> ' : '<span class="ir-prompt">&gt;</span> ';
            const cls = i === 0 ? "ir-line ir-line-head" : "ir-line";
            const activeLine = session.decodeLineIndex ?? 0;
            const cursor = decrypting && i === activeLine
                ? '<span class="ir-cursor">▌</span>' : "";
            return `<p class="${cls}">${prefix}${escape(text)}${cursor}</p>`;
        }).join("");
    }

    function renderQuiz(session) {
        const q = session.briefing.questions[session.currentQ];
        if (!q) return "";
        const wrongHint = session.lastWrongQ === session.currentQ
            ? '<p class="ir-wrong">答错了 · 奖金 −RM 200 · 请再选一次</p>' : "";
        const choices = q.choices.map((c, i) =>
            `<button type="button" class="ir-choice" data-ir-choice="${i}">${escape(c)}</button>`
        ).join("");
        return `
            <p class="ir-quiz-tag">EXTRACT · 细节验证</p>
            <p class="ir-quiz-progress">细节题 ${session.currentQ + 1} / ${session.briefing.questions.length}</p>
            <p class="ir-quiz-prompt">${escape(q.prompt)}</p>
            ${wrongHint}
            <div class="ir-choices">${choices}</div>`;
    }

    function renderDone(session, helpers) {
        const remain = computeRemainder(session);
        const mode = session.practiceOnly
            ? "练习模式 · 无奖金入账"
            : `预计入账 RM ${helpers.money(remain)}`;
        return `
            <div class="ir-done">
                <p class="ir-done-title">✅ 三题全对</p>
                <p class="ir-done-sub">${mode}</p>
                ${session.wrongCount ? `<p class="ir-done-meta">答错 ${session.wrongCount} 次</p>` : ""}
            </div>`;
    }

    function escape(t) {
        const d = document.createElement("div");
        d.textContent = t ?? "";
        return d.innerHTML;
    }

    function renderTerminal(session) {
        const decrypting = session.step === "read";
        const status = decrypting ? "DECRYPTING..." : "LOCKED";
        const dim = session.step === "quiz" || session.step === "done";
        return `
            <div class="ir-terminal ${dim ? "ir-terminal-dim" : ""}">
                <div class="ir-terminal-chrome">
                    <span class="ir-terminal-host">root@bnm-intercept</span>
                    <span class="ir-terminal-file">${escape(session.briefing.title)}</span>
                    <span class="ir-terminal-status">${status}</span>
                </div>
                <div class="ir-terminal-body">${renderReadBody(session)}</div>
            </div>`;
    }

    function render(session, helpers) {
        if (!session) return "";
        const { money = (n) => String(n) } = helpers || {};
        const remain = computeRemainder(session);
        const graceLeft = Math.max(0,
            (global.CurrencySafeRoomShared?.BONUS_LOOT?.graceMs || 20000)
            - (Date.now() - session.startedAt));
        const graceLabel = graceLeft > 0
            ? `宽限 ${Math.ceil(graceLeft / 1000)}s`
            : "计时扣款中";

        let afterTerminal = "";
        if (session.step === "read") {
            afterTerminal = `
                <p class="ir-hint muted">情报解密中 · 完成后自动进入答题</p>
                <button type="button" class="secondary ir-skip-read">跳过解密</button>`;
        } else if (session.step === "quiz") {
            afterTerminal = `<div class="ir-quiz-panel">${renderQuiz(session)}</div>`;
        } else if (session.step === "done") {
            afterTerminal = `<div class="ir-quiz-panel ir-done-panel">${renderDone(session, { money })}</div>`;
        }

        return `
            <div class="intel-read-panel">
                <div class="ir-pool-bar ${session.practiceOnly ? "practice" : ""}">
                    <span class="ir-pool-label">${session.practiceOnly ? "练习" : "奖金池"}</span>
                    <span class="ir-pool-amount" id="irPoolAmount">RM ${money(remain)}</span>
                    <span class="ir-pool-meta">${graceLabel}${session.wrongCount ? ` · 答错 −${session.wrongCount}×200` : ""}</span>
                </div>
                ${renderTerminal(session)}
                ${afterTerminal}
            </div>`;
    }

    global.MissionIntelread = {
        ready,
        createSession,
        tickDecode,
        tickTypewriter: tickDecode,
        skipToQuiz,
        submitAnswer,
        computeRemainder,
        render,
        pickBriefing,
        DECODE_MS: LINE_DECODE_MS,
        LINE_DECODE_MS
    };
})(typeof window !== "undefined" ? window : globalThis);
