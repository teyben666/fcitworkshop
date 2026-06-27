/**
 * KrackedMaps integration — game threat map + lobby/spectator preview (phase C).
 * Requires: js/vendor/krackedmaps.umd.js, css/vendor/krackedmaps.css
 */
(function (global) {
    const STATE_ID_TO_SLUG = {
        perlis: "perlis",
        kedah: "kedah",
        penang: "penang",
        perak: "perak",
        kelantan: "kelantan",
        terengganu: "terengganu",
        pahang: "pahang",
        selangor: "selangor",
        kl: "kuala-lumpur",
        putrajaya: "putrajaya",
        negeri_sembilan: "negeri-sembilan",
        melaka: "melaka",
        johor: "johor",
        sarawak: "sarawak",
        sabah: "sabah",
        labuan: "labuan"
    };

    const WORKSHOP_THEME = {
        "--sea": "#030810",
        "--grid": "rgba(0, 160, 220, 0.08)",
        "--grid-size": "38px",
        "--land": "#0d2950",
        "--land-hover": "#15406f",
        "--land-active": "#5fd0ff",
        "--stroke": "#5fa8ff",
        "--stroke-w": "1",
        "--district": "#0d2950",
        "--carve": "#3d77c0",
        "--district-hi": "#5fd0ff",
        "--label": "#cfe6ff",
        "--accent": "#5fd0ff",
        "--panel-bg": "#030810",
        "--panel-edge": "#1d3c6b"
    };

    function createMap() {
        return global.KrackedMaps?.createMalaysiaMap;
    }

    function layout() {
        return global.CurrencySafeMapLayout;
    }

    function destroyOn(container) {
        if (container?._kmInstance) {
            try { container._kmInstance.destroy(); } catch (_) { /* ignore */ }
            container._kmInstance = null;
        }
    }

    function mountWidget(host, opts) {
        const create = createMap();
        if (!create || !host) return null;
        destroyOn(host);
        host.innerHTML = "";
        const root = document.createElement("div");
        root.className = "kracked-map-mount";
        root.style.cssText = "position:absolute;inset:0;";
        host.appendChild(root);
        const map = create(root, {
            theme: WORKSHOP_THEME,
            panel: false,
            tooltip: false,
            showDistricts: false,
            interactive: opts?.interactive !== false,
            zoom: false,
            keyboard: false,
            labels: false,
            ...opts
        });
        host._kmInstance = map;
        return map;
    }

    function syncTransform(el, mapLayout) {
        if (!el || !mapLayout) return;
        const L = layout();
        if (!L) return;
        el.style.width = L.DESIGN_W + "px";
        el.style.height = L.DESIGN_H + "px";
        el.style.transform = `translate(${mapLayout.offsetX}px, ${mapLayout.offsetY}px) scale(${mapLayout.scale})`;
        el.style.transformOrigin = "0 0";
    }

    function playerChoropleth(players) {
        const data = {};
        (players || []).forEach((p) => {
            if (p._ghost) return;
            const slug = STATE_ID_TO_SLUG[p.stateId];
            if (slug) data[slug] = (data[slug] || 0) + 1;
        });
        return data;
    }

    function escapeHtml(text) {
        const d = document.createElement("div");
        d.textContent = text;
        return d.innerHTML;
    }

    function stateColor(stateId) {
        return global.getStateColor?.(stateId) || "#38bdf8";
    }

    /** Lobby + spectator preview */
    function renderPreview(container, players, options) {
        if (!container) return;
        options = options || {};
        if (container._kmDestroy) {
            container._kmDestroy();
            container._kmDestroy = null;
        }
        if (container._attackAnimId) {
            global.cancelAnimationFrame(container._attackAnimId);
            container._attackAnimId = null;
        }
        const L = layout();
        const MAP = L?.getConfig?.() || { w: 800, h: 353 };

        container.innerHTML =
            `<div class="map-preview-inner">
                <div class="kracked-map-root" data-km-preview></div>
                <canvas class="map-preview-attacks"></canvas>
                <div class="map-preview-markers"></div>
            </div>`;
        const inner = container.querySelector(".map-preview-inner");
        const kmHost = inner.querySelector("[data-km-preview]");
        const markersEl = container.querySelector(".map-preview-markers");
        const attackCanvas = container.querySelector(".map-preview-attacks");
        const attackCtx = attackCanvas.getContext("2d");
        let playersRef = players || [];

        const map = mountWidget(kmHost, { interactive: true });
        if (map) map.setData(playerChoropleth(playersRef));

        function placeMarkers() {
            if (!L) return;
            const rect = inner.getBoundingClientRect();
            const lay = L.computeLayout(rect.width, rect.height);
            global.__mapLayout = lay;
            syncTransform(kmHost, lay);
            markersEl.innerHTML = "";
            playersRef.forEach((p, i) => {
                let mapX = p.mapX;
                let mapY = p.mapY;
                if (mapX == null || mapY == null) {
                    const st = global.getMalaysiaStateById?.(p.stateId);
                    if (st) { mapX = st.mapX; mapY = st.mapY; }
                }
                if (mapX == null || mapY == null) return;
                const pos = L.imagePercentToWrapPercent(mapX, mapY, lay);
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
                if (options.highlightId && p.id === options.highlightId) el.classList.add("highlight");
                if (options.orderNumbers) el.dataset.order = String(i + 1);
                markersEl.appendChild(el);
            });
        }

        function drawAttacks(now) {
            if (options.showAttackLines === false) return;
            const rect = inner.getBoundingClientRect();
            if (rect.width <= 0) return;
            const lay = L.computeLayout(rect.width, rect.height);
            const dpr = Math.min(global.devicePixelRatio || 1, 2);
            attackCanvas.width = Math.floor(rect.width * dpr);
            attackCanvas.height = Math.floor(rect.height * dpr);
            attackCanvas.style.width = rect.width + "px";
            attackCanvas.style.height = rect.height + "px";
            attackCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
            attackCtx.clearRect(0, 0, rect.width, rect.height);
            attackCtx.save();
            attackCtx.translate(lay.offsetX, lay.offsetY);
            attackCtx.scale(lay.scale, lay.scale);
            const links = global.MapAttackLines?.collectFromPlayers(playersRef) || [];
            global.MapAttackLines?.drawAll(attackCtx, links, MAP.w, MAP.h, now);
            attackCtx.restore();
        }

        let animId = null;
        function frame(now) {
            drawAttacks(now);
            animId = global.requestAnimationFrame(frame);
        }

        function relayout() {
            placeMarkers();
            if (map) map.setData(playerChoropleth(playersRef));
        }

        relayout();
        if (options.showAttackLines !== false) {
            if (container._attackAnimId) global.cancelAnimationFrame(container._attackAnimId);
            animId = global.requestAnimationFrame(frame);
            container._attackAnimId = animId;
        }

        if (!container._mapResizeObs && typeof global.ResizeObserver !== "undefined") {
            container._mapResizeObs = new global.ResizeObserver(relayout);
            container._mapResizeObs.observe(inner);
        }
        container._mapPlaceMarkers = relayout;
        container._mapSetPlayers = (next) => {
            playersRef = next || [];
            relayout();
        };
        container._kmDestroy = () => {
            if (container._attackAnimId) global.cancelAnimationFrame(container._attackAnimId);
            destroyOn(kmHost);
        };
    }

    /** Game threat map — mount Kracked base; returns syncTransform helper */
    function mountGameBase(threatMapEl) {
        if (!threatMapEl) return null;
        let host = threatMapEl.querySelector("[data-km-game]");
        if (!host) {
            host = document.createElement("div");
            host.className = "kracked-map-root";
            host.dataset.kmGame = "1";
            const canvas = threatMapEl.querySelector("#threatMapCanvas");
            threatMapEl.insertBefore(host, canvas || threatMapEl.firstChild);
        }
        const map = mountWidget(host, { interactive: true });
        if (map) {
            map.on("select", (slug) => {
                const st = (global.MALAYSIA_STATES || []).find(
                    (s) => STATE_ID_TO_SLUG[s.id] === slug
                );
                if (st && global.showToast && global.CurrencySafeI18n) {
                    const label = global.getStateLabel?.(st.id) || st.label;
                    global.showToast(label);
                }
            });
        }
        return { host, map };
    }

    function syncGameTransform(host) {
        const lay = global.__mapLayout;
        if (host && lay) syncTransform(host, lay);
    }

    function setGameChoropleth(map, teams) {
        if (!map?.setData) return;
        const data = {};
        (teams || []).forEach((t) => {
            const slug = STATE_ID_TO_SLUG[t.stateId];
            if (slug) data[slug] = (data[slug] || 0) + 1;
        });
        map.setData(data);
    }

    global.KrackedMalaysiaMap = {
        WORKSHOP_THEME,
        STATE_ID_TO_SLUG,
        renderPreview,
        mountGameBase,
        syncGameTransform,
        setGameChoropleth,
        syncTransform
    };

    global.MalaysiaMapPreview = {
        render: renderPreview,
        MAP: layout()?.getConfig?.() || {}
    };
})(typeof window !== "undefined" ? window : globalThis);
