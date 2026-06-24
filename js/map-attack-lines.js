/**
 * Shared mission attack lines — state-colored pulse along attacker ↔ target vaults.
 */
(function () {
    const CYCLE_MS = 2600;
    const TAIL_SPAN = 0.24;
    const TAIL_SEGMENTS = 14;

    function getStateColor(stateId) {
        return window.getStateColor?.(stateId) || "#ff3355";
    }

    function resolveMapPercent(team) {
        if (!team) return null;
        if (team.mapX != null && team.mapY != null) {
            return { x: team.mapX, y: team.mapY };
        }
        if (team.stateId) {
            const st = window.getMalaysiaStateById?.(team.stateId);
            if (st?.mapX != null) return { x: st.mapX, y: st.mapY };
        }
        if (team.x != null && team.y != null) return { x: team.x, y: team.y };
        return null;
    }

    function teamToMapXY(team, mapW, mapH) {
        const pos = resolveMapPercent(team);
        if (!pos) return null;
        return { x: (pos.x / 100) * mapW, y: (pos.y / 100) * mapH };
    }

    function buildAttackCurve(p1, p2) {
        const mx = (p1.x + p2.x) / 2;
        const my = Math.min(p1.y, p2.y) - 35 - Math.hypot(p2.x - p1.x, p2.y - p1.y) * 0.12;
        return { sx: p1.x, sy: p1.y, cx: mx, cy: my, ex: p2.x, ey: p2.y };
    }

    function pointOnQuad(t, a) {
        const u = 1 - t;
        return {
            x: u * u * a.sx + 2 * u * t * a.cx + t * t * a.ex,
            y: u * u * a.sy + 2 * u * t * a.cy + t * t * a.ey
        };
    }

    function clamp01(t) {
        return Math.max(0, Math.min(1, t));
    }

    function collectAttackingIds(players) {
        const ids = new Set();
        (players || []).forEach(p => {
            const tid = p.missionProgress?.targetId;
            if (tid && tid !== p.id) ids.add(p.id);
        });
        return ids;
    }

    function collectFromPlayers(players) {
        const list = players || [];
        const byId = Object.fromEntries(list.map(p => [p.id, p]));
        const links = [];
        list.forEach(p => {
            const tid = p.missionProgress?.targetId;
            if (!tid || tid === p.id) return;
            const target = byId[tid];
            if (!target) return;
            if (!resolveMapPercent(p) || !resolveMapPercent(target)) return;
            links.push({ attacker: p, target });
        });
        return links;
    }

    function drawPulseTail(ctx, curve, headT, tailSign, headColor) {
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        for (let i = 0; i < TAIL_SEGMENTS; i++) {
            const tNear = clamp01(headT + tailSign * (i / TAIL_SEGMENTS) * TAIL_SPAN);
            const tFar = clamp01(headT + tailSign * ((i + 1) / TAIL_SEGMENTS) * TAIL_SPAN);
            if (Math.abs(tFar - tNear) < 0.0005) continue;

            const pNear = pointOnQuad(tNear, curve);
            const pFar = pointOnQuad(tFar, curve);
            const fade = 1 - i / TAIL_SEGMENTS;

            ctx.globalAlpha = fade * 0.92;
            ctx.strokeStyle = headColor;
            ctx.lineWidth = 1.4 + fade * 2.6;
            ctx.shadowColor = headColor;
            ctx.shadowBlur = i === 0 ? 14 : 4 * fade;
            ctx.beginPath();
            ctx.moveTo(pNear.x, pNear.y);
            ctx.lineTo(pFar.x, pFar.y);
            ctx.stroke();
        }
    }

    function drawLink(ctx, attacker, target, mapW, mapH, now, phaseOffset) {
        const p1 = teamToMapXY(attacker, mapW, mapH);
        const p2 = teamToMapXY(target, mapW, mapH);
        if (!p1 || !p2) return false;

        const atkColor = getStateColor(attacker.stateId);
        const curve = buildAttackCurve(p1, p2);

        const phase = ((now + (phaseOffset || 0)) % CYCLE_MS) / CYCLE_MS;
        const outbound = phase < 0.5;
        const half = phase * 2;
        const headT = outbound ? half : (2 - half);
        const tailSign = outbound ? -1 : 1;

        ctx.save();

        ctx.strokeStyle = atkColor;
        ctx.lineWidth = 1.2;
        ctx.globalAlpha = 0.1;
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.moveTo(curve.sx, curve.sy);
        ctx.quadraticCurveTo(curve.cx, curve.cy, curve.ex, curve.ey);
        ctx.stroke();

        drawPulseTail(ctx, curve, headT, tailSign, atkColor);

        ctx.restore();
        return true;
    }

    function drawAll(ctx, links, mapW, mapH, now) {
        let count = 0;
        (links || []).forEach((link, i) => {
            if (drawLink(ctx, link.attacker, link.target, mapW, mapH, now, i * 420)) count++;
        });
        return count;
    }

    window.MapAttackLines = {
        collectAttackingIds,
        collectFromPlayers,
        drawLink,
        drawAll,
        teamToMapXY,
        getStateColor
    };
})();
