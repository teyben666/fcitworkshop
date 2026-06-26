/**
 * Central bank Bonus flash pin — deterministic phase from matchStartedAt.
 * Practice: first 2:00, every 2min, breathe 12s (18s visible).
 * Competitive: first 4:00, every 4min, breathe 9s (15s visible).
 */
(function (global) {
    const BANK_FLASH = {
        practice: { intervalMs: 120_000, breatheMs: 12_000, firstDelayMs: 120_000 },
        competitive: { intervalMs: 240_000, breatheMs: 9_000, firstDelayMs: 240_000 },
        arriveMs: 3_000,
        departMs: 3_000
    };

    /** South China Sea — between peninsula and East Malaysia */
    const BANK_BONUS_PIN = {
        id: "__BANK_BONUS__",
        name: "央行 Bonus",
        mapX: 44,
        mapY: 54,
        lat: 4.8,
        lon: 109.2,
        state: "海域",
        stateId: "bank_bonus",
        icon: "🏦"
    };

    function modeConfig(room) {
        return room?.mode === "competitive" ? BANK_FLASH.competitive : BANK_FLASH.practice;
    }

    function waveDurationMs(cfg) {
        return BANK_FLASH.arriveMs + cfg.breatheMs + BANK_FLASH.departMs;
    }

    function computePhase(room, nowMs) {
        const now = Number(nowMs) || Date.now();
        if (!room || room.status !== "playing" || !room.matchStartedAt) {
            return {
                phase: "hidden",
                waveIndex: -1,
                phaseEndsAt: null,
                breatheMs: 0,
                visible: false,
                clickable: false
            };
        }
        const cfg = modeConfig(room);
        const elapsed = now - room.matchStartedAt;
        if (elapsed < cfg.firstDelayMs) {
            return {
                phase: "hidden",
                waveIndex: -1,
                phaseEndsAt: room.matchStartedAt + cfg.firstDelayMs,
                breatheMs: cfg.breatheMs,
                visible: false,
                clickable: false,
                nextFlashAt: room.matchStartedAt + cfg.firstDelayMs
            };
        }

        const sinceFirst = elapsed - cfg.firstDelayMs;
        const waveIndex = Math.floor(sinceFirst / cfg.intervalMs);
        const posInWave = sinceFirst - waveIndex * cfg.intervalMs;
        const waveLen = waveDurationMs(cfg);

        if (posInWave >= waveLen) {
            const nextAt = room.matchStartedAt + cfg.firstDelayMs + (waveIndex + 1) * cfg.intervalMs;
            return {
                phase: "hidden",
                waveIndex,
                phaseEndsAt: nextAt,
                breatheMs: cfg.breatheMs,
                visible: false,
                clickable: false,
                nextFlashAt: nextAt
            };
        }

        const waveStart = room.matchStartedAt + cfg.firstDelayMs + waveIndex * cfg.intervalMs;
        let phase = "hidden";
        let phaseEndsAt = waveStart + waveLen;

        if (posInWave < BANK_FLASH.arriveMs) {
            phase = "arrive";
            phaseEndsAt = waveStart + BANK_FLASH.arriveMs;
        } else if (posInWave < BANK_FLASH.arriveMs + cfg.breatheMs) {
            phase = "breathe";
            phaseEndsAt = waveStart + BANK_FLASH.arriveMs + cfg.breatheMs;
        } else {
            phase = "depart";
            phaseEndsAt = waveStart + waveLen;
        }

        return {
            phase,
            waveIndex,
            phaseEndsAt,
            breatheMs: cfg.breatheMs,
            visible: phase !== "hidden",
            clickable: phase === "breathe",
            nextFlashAt: waveStart,
            posInWave
        };
    }

    function phaseLabel(status) {
        if (!status || status.phase === "hidden") return "";
        const map = {
            arrive: "闪灯进场",
            breathe: "可点击参与",
            depart: "闪灯离场"
        };
        return map[status.phase] || "";
    }

    function formatCountdown(ms) {
        const s = Math.max(0, Math.ceil(ms / 1000));
        return `${s}s`;
    }

    global.BankBonusScheduler = {
        BANK_FLASH,
        BANK_BONUS_PIN,
        modeConfig,
        waveDurationMs,
        computePhase,
        phaseLabel,
        formatCountdown
    };
})(typeof window !== "undefined" ? window : globalThis);
