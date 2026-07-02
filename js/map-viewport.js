/**
 * Shared map pan/zoom viewport (desktop classroom — mouse wheel + left-drag).
 */
(function (global) {
    const layoutApi = () => global.CurrencySafeMapLayout;

    function designSize() {
        const cfg = layoutApi()?.getConfig?.() || { w: 799.85, h: 352.74 };
        return { w: cfg.w, h: cfg.h };
    }

    function labelZoomButtons(bar) {
        const t = (k) => global.CurrencySafeI18n?.t?.(k) ?? k;
        bar.querySelector('[data-zoom-dir="in"]')?.setAttribute("aria-label", t("mapZoomIn"));
        bar.querySelector('[data-zoom-dir="out"]')?.setAttribute("aria-label", t("mapZoomOut"));
        bar.querySelector("[data-zoom-reset]")?.setAttribute("aria-label", t("mapZoomReset"));
    }

    /**
     * @param {object} [opts]
     * @param {number} [opts.zoom]
     * @param {number} [opts.panX]
     * @param {number} [opts.panY]
     * @param {number} [opts.zoomMin]
     * @param {number} [opts.zoomMax]
     */
    function create(opts) {
        opts = opts || {};
        let zoom = opts.zoom ?? 1;
        let panX = opts.panX ?? 0;
        let panY = opts.panY ?? 0;
        const zoomMin = opts.zoomMin ?? 1;
        const zoomMax = opts.zoomMax ?? 2.8;
        const zoomWheelFactor = opts.zoomWheelFactor ?? 1.12;

        function getState() {
            return { zoom, panX, panY };
        }

        function setState(state) {
            if (!state) return;
            if (typeof state.zoom === "number") zoom = state.zoom;
            if (typeof state.panX === "number") panX = state.panX;
            if (typeof state.panY === "number") panY = state.panY;
        }

        function computeLayout(wrapW, wrapH) {
            const L = layoutApi();
            if (!L) return null;
            return L.computeLayout(wrapW, wrapH, { zoom, panX, panY });
        }

        function clampPan(wrapW, wrapH) {
            const { w, h } = designSize();
            if (zoom <= 1.001) {
                zoom = 1;
                panX = 0;
                panY = 0;
                return;
            }
            const baseScale = Math.min(wrapW / w, wrapH / h);
            const scale = baseScale * zoom;
            const drawW = w * scale;
            const drawH = h * scale;
            const maxPanX = Math.max(0, (drawW - wrapW) / 2);
            const maxPanY = Math.max(0, (drawH - wrapH) / 2);
            panX = Math.max(-maxPanX, Math.min(maxPanX, panX));
            panY = Math.max(-maxPanY, Math.min(maxPanY, panY));
        }

        function reset() {
            zoom = 1;
            panX = 0;
            panY = 0;
        }

        function zoomAt(wrap, clientX, clientY, deltaY) {
            if (!wrap) return false;
            const { w, h } = designSize();
            const rect = wrap.getBoundingClientRect();
            const mx = clientX - rect.left;
            const my = clientY - rect.top;
            const wrapW = wrap.clientWidth;
            const wrapH = wrap.clientHeight;
            const layout = computeLayout(wrapW, wrapH);
            if (!layout) return false;
            const factor = deltaY < 0 ? zoomWheelFactor : 1 / zoomWheelFactor;
            const newZoom = Math.max(zoomMin, Math.min(zoomMax, zoom * factor));
            if (Math.abs(newZoom - zoom) < 0.001) return false;
            const mapX = (mx - layout.offsetX) / layout.scale;
            const mapY = (my - layout.offsetY) / layout.scale;
            zoom = newZoom;
            if (zoom <= 1.001) {
                reset();
            } else {
                const baseScale = Math.min(wrapW / w, wrapH / h);
                const newScale = baseScale * zoom;
                panX = mx - mapX * newScale - (wrapW - w * newScale) / 2;
                panY = my - mapY * newScale - (wrapH - h * newScale) / 2;
            }
            clampPan(wrapW, wrapH);
            return true;
        }

        function stepZoom(wrap, delta) {
            if (!wrap) return false;
            const rect = wrap.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const dy = delta > 0 ? -1 : 1;
            return zoomAt(wrap, cx, cy, dy);
        }

        function setupPanning(wrap, onChange) {
            if (!wrap || wrap._mapViewportPanBound) return;
            wrap._mapViewportPanBound = true;
            let panning = false;
            let panMoved = false;
            let startX = 0;
            let startY = 0;
            let startPanX = 0;
            let startPanY = 0;

            wrap.addEventListener("mousedown", (e) => {
                if (e.button !== 0) return;
                if (e.target.closest(".map-preview-zoom, .map-zoom-btn, .threat-marker")) return;
                panning = true;
                panMoved = false;
                startX = e.clientX;
                startY = e.clientY;
                startPanX = panX;
                startPanY = panY;
                wrap.classList.add("is-panning");
            });

            const onMove = (e) => {
                if (!panning) return;
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                if (Math.abs(dx) > 3 || Math.abs(dy) > 3) panMoved = true;
                panX = startPanX + dx;
                panY = startPanY + dy;
                clampPan(wrap.clientWidth, wrap.clientHeight);
                if (onChange) onChange();
            };

            const endPan = () => {
                if (!panning) return;
                panning = false;
                wrap.classList.remove("is-panning");
                if (panMoved) wrap.dataset.suppressClick = "1";
            };

            global.addEventListener("mousemove", onMove);
            global.addEventListener("mouseup", endPan);
            wrap.addEventListener("click", (e) => {
                if (wrap.dataset.suppressClick === "1") {
                    wrap.dataset.suppressClick = "";
                    e.stopPropagation();
                    e.preventDefault();
                }
            }, true);
        }

        function bindWheel(wrap, onChange) {
            if (!wrap || wrap._mapViewportWheelBound) return;
            wrap._mapViewportWheelBound = true;
            wrap.addEventListener("wheel", (e) => {
                e.preventDefault();
                if (zoomAt(wrap, e.clientX, e.clientY, e.deltaY) && onChange) onChange();
            }, { passive: false });
        }

        function bindZoomControls(wrap, onChange) {
            if (!wrap) return;
            let bar = wrap.querySelector(".map-preview-zoom");
            if (!bar) {
                bar = document.createElement("div");
                bar.className = "map-preview-zoom";
                bar.innerHTML =
                    `<button type="button" class="map-zoom-btn" data-zoom-dir="in">+</button>` +
                    `<button type="button" class="map-zoom-btn" data-zoom-dir="out">−</button>` +
                    `<button type="button" class="map-zoom-btn" data-zoom-reset>⟲</button>`;
                wrap.appendChild(bar);
                bar.querySelector('[data-zoom-dir="in"]')?.addEventListener("click", (e) => {
                    e.stopPropagation();
                    if (stepZoom(wrap, 1) && onChange) onChange();
                });
                bar.querySelector('[data-zoom-dir="out"]')?.addEventListener("click", (e) => {
                    e.stopPropagation();
                    if (stepZoom(wrap, -1) && onChange) onChange();
                });
                bar.querySelector("[data-zoom-reset]")?.addEventListener("click", (e) => {
                    e.stopPropagation();
                    reset();
                    if (onChange) onChange();
                });
            }
            labelZoomButtons(bar);
        }

        return {
            getState,
            setState,
            computeLayout,
            clampPan,
            reset,
            zoomAt,
            stepZoom,
            setupPanning,
            bindWheel,
            bindZoomControls
        };
    }

    global.CurrencySafeMapViewport = { create, labelZoomButtons };
})(window);
