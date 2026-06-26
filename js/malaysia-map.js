/**
 * Read-only Malaysia map preview (lobby + spectator) with state-colored attack lines.
 */
(function () {
    const MAP = {
        w: 643, h: 316,
        image: "malaysia.png",
        imageFallback: "malaysia-map.svg"
    };

    function computeLayout(wrapW, wrapH) {
        const scale = Math.min(wrapW / MAP.w, wrapH / MAP.h);
        const drawW = MAP.w * scale;
        const drawH = MAP.h * scale;
        return {
            wrapW, wrapH,
            offsetX: (wrapW - drawW) / 2,
            offsetY: (wrapH - drawH) / 2,
            drawW, drawH, scale
        };
    }

    function mapXYToPercent(mapX, mapY, layout) {
        const px = (mapX / 100) * MAP.w;
        const py = (mapY / 100) * MAP.h;
        const x = layout.offsetX + (px / MAP.w) * layout.drawW;
        const y = layout.offsetY + (py / MAP.h) * layout.drawH;
        return {
            x: Math.max(1, Math.min(99, (x / layout.wrapW) * 100)),
            y: Math.max(1, Math.min(99, (y / layout.wrapH) * 100))
        };
    }

    function escapeHtml(text) {
        const d = document.createElement("div");
        d.textContent = text;
        return d.innerHTML;
    }

    function stateColor(stateId) {
        return window.getStateColor?.(stateId) || "#38bdf8";
    }

    function stopAttackAnim(container) {
        if (container._attackAnimId) {
            cancelAnimationFrame(container._attackAnimId);
            container._attackAnimId = null;
        }
    }

    function startAttackAnim(container, canvas, ctx, getPlayers) {
        stopAttackAnim(container);
        function frame(now) {
            const rect = container.querySelector(".map-preview-inner")?.getBoundingClientRect();
            if (!rect || rect.width <= 0) {
                container._attackAnimId = requestAnimationFrame(frame);
                return;
            }
            const layout = computeLayout(rect.width, rect.height);
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = Math.floor(rect.width * dpr);
            canvas.height = Math.floor(rect.height * dpr);
            canvas.style.width = rect.width + "px";
            canvas.style.height = rect.height + "px";
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, rect.width, rect.height);
            ctx.save();
            ctx.translate(layout.offsetX, layout.offsetY);
            ctx.scale(layout.scale, layout.scale);
            const links = window.MapAttackLines?.collectFromPlayers(getPlayers() || []) || [];
            window.MapAttackLines?.drawAll(ctx, links, MAP.w, MAP.h, now);
            ctx.restore();
            container._attackAnimId = requestAnimationFrame(frame);
        }
        container._attackAnimId = requestAnimationFrame(frame);
    }

    function render(container, players, options) {
        if (!container) return;
        options = options || {};
        stopAttackAnim(container);
        container.innerHTML =
            `<div class="map-preview-inner">
                <img class="map-preview-img" src="${MAP.image}" alt="Malaysia map" />
                <canvas class="map-preview-attacks"></canvas>
                <div class="map-preview-markers"></div>
            </div>`;
        const inner = container.querySelector(".map-preview-inner");
        const markersEl = container.querySelector(".map-preview-markers");
        const attackCanvas = container.querySelector(".map-preview-attacks");
        const attackCtx = attackCanvas.getContext("2d");
        const img = container.querySelector(".map-preview-img");
        let fallbackStep = 0;
        img.onerror = function onMapImgError() {
            if (fallbackStep === 0 && MAP.imageFallback && img.src.indexOf(MAP.imageFallback) === -1) {
                fallbackStep = 1;
                img.src = MAP.imageFallback;
                return;
            }
            img.onerror = null;
        };
        let playersRef = players || [];

        function placeMarkers() {
            const rect = inner.getBoundingClientRect();
            const layout = computeLayout(rect.width, rect.height);
            markersEl.innerHTML = "";
            playersRef.forEach((p, i) => {
                let mapX = p.mapX;
                let mapY = p.mapY;
                if (mapX == null || mapY == null) {
                    const st = window.getMalaysiaStateById?.(p.stateId);
                    if (st) {
                        mapX = st.mapX;
                        mapY = st.mapY;
                    }
                }
                if (mapX == null || mapY == null) return;
                const pos = mapXYToPercent(mapX, mapY, layout);
                const el = document.createElement("div");
                const isGhost = !!p._ghost;
                el.className = "map-preview-marker" + (isGhost ? " ghost" : "");
                el.style.left = pos.x + "%";
                el.style.top = pos.y + "%";
                const label = p.state ? ` · ${p.state}` : "";
                const dotColor = stateColor(p.stateId);
                const labelColor = isGhost ? "var(--muted, #8ba4be)" : stateColor(p.stateId);
                const bal = Number(p.balance || 0).toLocaleString("en-MY");
                const pinName = isGhost
                    ? `${escapeHtml(p.name || "空")} · 待进驻`
                    : `${escapeHtml(p.icon || "🧑")} ${escapeHtml(p.name || "Player")}${escapeHtml(label)}`;
                const pinBal = isGhost ? "" : `<span class="pin-line pin-balance">RM ${bal}</span>`;
                el.innerHTML =
                    `<span class="map-preview-dot" style="background:${dotColor};box-shadow:0 0 12px ${dotColor}${isGhost ? "44" : "99"};${isGhost ? "opacity:0.45;" : ""}"></span>` +
                    `<span class="map-preview-label" style="color:${labelColor};${isGhost ? "opacity:0.7;" : ""}">` +
                    `<span class="pin-line pin-name">${pinName}</span>${pinBal}</span>`;
                if (options.highlightId && p.id === options.highlightId) {
                    el.classList.add("highlight");
                }
                if (options.orderNumbers) {
                    el.dataset.order = String(i + 1);
                }
                markersEl.appendChild(el);
            });
        }

        function getPlayers() { return playersRef; }

        if (img.complete) placeMarkers();
        else img.onload = placeMarkers;

        if (!container._mapResizeObs && typeof ResizeObserver !== "undefined") {
            try {
                container._mapResizeObs = new ResizeObserver(() => placeMarkers());
                container._mapResizeObs.observe(inner);
            } catch (_) { /* ignore */ }
        }
        container._mapPlaceMarkers = placeMarkers;
        container._mapSetPlayers = (next) => {
            playersRef = next || [];
            placeMarkers();
        };
        if (options.showAttackLines !== false) {
            startAttackAnim(container, attackCanvas, attackCtx, getPlayers);
        }
    }

    window.MalaysiaMapPreview = { render, MAP };
})();
