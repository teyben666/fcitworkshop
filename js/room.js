/**
 * Currency Safe — room API facade (WebSocket server | localStorage fallback)
 */
(function () {
    const serverCfg = window.CURRENCY_SAFE_SERVER || { enabled: true, wsUrl: "auto" };
    let backend = window.CurrencySafeRoomLocal;
    let ready = Promise.resolve();

    function useWs() {
        if (!window.CurrencySafeRoomWs) return false;
        const cfg = window.CURRENCY_SAFE_SERVER || { enabled: true, wsUrl: "auto" };
        if (cfg.enabled === false) return false;
        return true;
    }

    async function initWsBackend(wsBackend, attempts) {
        const n = attempts || 4;
        let lastErr;
        for (let i = 0; i < n; i++) {
            try {
                await wsBackend.init();
                return wsBackend;
            } catch (err) {
                lastErr = err;
                if (i < n - 1) await new Promise(r => setTimeout(r, 2000));
            }
        }
        throw lastErr;
    }

    if (useWs()) {
        backend = window.CurrencySafeRoomWs;
        ready = initWsBackend(backend).then(() => {
            console.log("Currency Safe: WebSocket 服务器同步已启用", backend.getActiveWsUrl?.() || "");
        }).catch(err => {
            window.CURRENCY_SAFE_WS_ERROR = err?.message || String(err);
            console.warn("WebSocket 连接失败，回退本机同步：", err);
            backend = window.CurrencySafeRoomLocal;
        });
    }

    const SYNC_METHODS = new Set([
        "getClientId", "getRoom", "getSessionRoom", "getSessionRole",
        "isHost", "canWrite", "getRoomSettings", "getMaxDeployPerTarget",
        "getTeamDeployCountRoom", "getConnectionStatus", "onConnectionChange",
        "subscribe"
    ]);

    const METHODS = [
        "getClientId", "createRoom", "getRoom", "saveRoom", "joinRoom", "reconnectRoom", "ensureRoom",
        "joinRoomAsPlayer", "joinRoomAsSpectator", "setRoomMode", "shufflePlayers", "shuffleStatesOnly",
        "setRoomJoinPassword",
        "startGame", "endGame", "beginLaunchCountdown", "cancelLaunchCountdown",
        "kickPlayer", "kickSpectator", "leaveRoom", "getSessionRoom", "getSessionRole",
        "isHost", "canWrite", "coordsFromState", "updatePlayerInRoom", "updatePlayerProgress",
        "getRoomSettings", "logActivity", "applyBreach", "applyTransfer", "applyBankTransfer",
        "beginBankBonus", "completeBankBonus", "getMaxDeployPerTarget",
        "claimTargetDeploy", "claimTeamDeploy", "shuffleTeamGroups", "assignPlayerToTeam", "createTeam",
        "getTeamDeployCountRoom", "subscribe", "exportRoomCsv", "exportRoomReport",
        "setMatchDuration", "autoEndGameIfExpired", "touchLobbyPresence",
        "getConnectionStatus", "onConnectionChange"
    ];

    const api = {
        SK: window.CurrencySafeRoomShared.SK,
        ready,
        isOnline: () => backend.backendName === "ws",
        getBackend: () => backend.backendName || "local"
    };

    METHODS.forEach(name => {
        api[name] = function (...args) {
            if (SYNC_METHODS.has(name)) {
                return backend[name](...args);
            }
            return ready.then(() => backend[name](...args));
        };
    });

    api.pushActivity = function (room, type, message) {
        return ready.then(() => {
            if (backend.logActivity) {
                return backend.logActivity(room.id || room, type, message);
            }
        });
    };

    window.CurrencySafeRoom = api;
})();
