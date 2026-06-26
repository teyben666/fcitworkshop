/**
 * Shared visual FX — confetti zones, balance animation, delays
 */
(function () {
    const COLORS = ["#38bdf8", "#22d3ee", "#ffd65a", "#ff6e79", "#a78bfa"];

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function getZoneRect(zone, containerEl) {
        if (zone === "mission" && containerEl) {
            return containerEl.getBoundingClientRect();
        }
        if (zone === "podium" && containerEl) {
            return containerEl.getBoundingClientRect();
        }
        return {
            left: 0, top: 0, width: window.innerWidth, height: window.innerHeight
        };
    }

    function spawnConfettiPiece(rect, opts) {
        const light = opts?.light;
        const count = light ? 12 : 28;
        const layer = opts?.layer || document.body;
        const pieces = [];
        for (let i = 0; i < count; i++) {
            const c = document.createElement("div");
            c.className = "cs-confetti";
            const x = rect.left + Math.random() * rect.width;
            const y = rect.top + (light ? Math.random() * rect.height * 0.4 : rect.height * 0.35);
            c.style.left = x + "px";
            c.style.top = y + "px";
            c.style.background = COLORS[i % COLORS.length];
            c.style.setProperty("--x", (Math.random() * 520 - 260) + "px");
            c.style.setProperty("--y", (Math.random() * 340 + 110) + "px");
            layer.appendChild(c);
            pieces.push(c);
            setTimeout(() => c.remove(), 950);
        }
        return pieces;
    }

    function confetti(opts) {
        opts = opts || {};
        const zone = opts.zone || "fullscreen";
        let container = null;
        if (zone === "mission") container = document.getElementById("missionFxLayer");
        else if (zone === "podium") container = document.getElementById("podiumFxLayer");
        const rect = getZoneRect(zone, container);
        const layer = (zone === "mission" || zone === "podium") && container ? container : document.body;
        if (container && zone !== "fullscreen") {
            container.style.pointerEvents = "none";
        }
        return spawnConfettiPiece(rect, { light: opts.light, layer });
    }

    let confettiLoopId = null;

    function startConfettiLoop(opts) {
        stopConfettiLoop();
        confetti(opts || { zone: "fullscreen" });
        confettiLoopId = setInterval(() => confetti({ zone: "fullscreen", light: true }), 700);
    }

    function stopConfettiLoop() {
        if (confettiLoopId) {
            clearInterval(confettiLoopId);
            confettiLoopId = null;
        }
        document.querySelectorAll(".cs-confetti").forEach(el => el.remove());
    }

    function money(n) {
        return Number(n || 0).toLocaleString("en-MY");
    }

    /** 500–900ms by delta; large amounts cap at 1200ms */
    function balanceAnimDuration(fromN, toN) {
        const delta = Math.abs((Number(toN) || 0) - (Number(fromN) || 0));
        if (delta >= 50000) return 1200;
        if (delta >= 10000) return 900;
        if (delta >= 2000) return 700;
        return 500;
    }

    function easeOutCubic(p) {
        return 1 - Math.pow(1 - p, 3);
    }

    function animateHudBalance(from, to, opts) {
        opts = opts || {};
        const pill = document.getElementById(opts.pillId || "hudBalancePill");
        const el = document.getElementById(opts.balanceId || "hudBalance");
        if (!el) return Promise.resolve();
        const fromN = Number(from) || 0;
        const toN = Number(to) || 0;
        if (fromN === toN) {
            el.textContent = money(toN);
            return Promise.resolve();
        }
        const delta = toN - fromN;
        const duration = opts.duration || balanceAnimDuration(fromN, toN);
        if (delta > 0 && pill) pill.classList.add("pill-credit");
        if (delta < 0 && pill) {
            pill.classList.add("pill-debit");
            if (opts.shake !== false) {
                pill.animate([
                    { transform: "translateX(0)" },
                    { transform: "translateX(-6px)" },
                    { transform: "translateX(6px)" },
                    { transform: "translateX(0)" }
                ], { duration: 280 });
            }
        }
        let floater = null;
        if (delta !== 0 && pill) {
            floater = document.createElement("span");
            floater.className = delta > 0 ? "balance-delta balance-delta-credit" : "balance-delta balance-delta-debit";
            floater.textContent = (delta > 0 ? "+RM " : "-RM ") + money(Math.abs(delta));
            pill.style.position = pill.style.position || "relative";
            pill.appendChild(floater);
            setTimeout(() => floater?.remove(), 950);
        }
        const t0 = performance.now();
        return new Promise(resolve => {
            function frame(now) {
                const p = Math.min(1, (now - t0) / duration);
                const eased = easeOutCubic(p);
                el.textContent = money(Math.round(fromN + (toN - fromN) * eased));
                if (p < 1) requestAnimationFrame(frame);
                else {
                    if (pill) {
                        setTimeout(() => {
                            pill.classList.remove("pill-credit", "pill-debit");
                        }, 400);
                    }
                    resolve();
                }
            }
            requestAnimationFrame(frame);
        });
    }

    window.CurrencySafeFx = {
        delay, confetti, startConfettiLoop, stopConfettiLoop,
        animateHudBalance, balanceAnimDuration, money
    };
})();
