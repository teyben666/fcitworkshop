/**
 * Currency Safe — room API facade (localStorage or Firebase)
 */
(function () {
    const cfg = window.CURRENCY_SAFE_FIREBASE || {};
    let backend = window.CurrencySafeRoomLocal;
    let ready = Promise.resolve();

    function useFirebase() {
        return !!(cfg.enabled && cfg.apiKey && cfg.databaseURL);
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const s = document.createElement("script");
            s.src = src;
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
        });
    }

    if (useFirebase()) {
        ready = loadScript("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js")
            .then(() => loadScript("https://www.gstatic.com/firebasejs/10.14.1/firebase-database-compat.js"))
            .then(() => {
                window.CurrencySafeRoomFirebase.init(cfg);
                backend = window.CurrencySafeRoomFirebase;
                console.log("Currency Safe: Firebase Realtime Database 已启用");
            })
            .catch(err => {
                console.warn("Firebase 加载失败，回退 localStorage：", err);
                backend = window.CurrencySafeRoomLocal;
            });
    }

    const METHODS = [
        "getClientId", "createRoom", "getRoom", "saveRoom", "joinRoom", "reconnectRoom",
        "joinRoomAsPlayer", "joinRoomAsSpectator", "setRoomMode", "shufflePlayers",
        "startGame", "endGame", "kickPlayer", "leaveRoom", "getSessionRoom", "getSessionRole",
        "isHost", "canWrite", "coordsFromState", "updatePlayerInRoom", "updatePlayerProgress",
        "getRoomSettings", "logActivity", "applyBreach", "applyTransfer", "getMaxDeployPerTarget",
        "claimTargetDeploy", "subscribe", "exportRoomCsv", "exportRoomReport",
        "setMatchDuration", "autoEndGameIfExpired"
    ];

    const api = {
        SK: window.CurrencySafeRoomShared.SK,
        ready,
        isOnline: () => backend.backendName === "firebase",
        getBackend: () => backend.backendName || "local"
    };

    METHODS.forEach(name => {
        api[name] = function (...args) {
            return backend[name](...args);
        };
    });

    api.pushActivity = function (room, type, message) {
        if (backend.logActivity) {
            return backend.logActivity(room.id || room, type, message);
        }
    };

    window.CurrencySafeRoom = api;
})();
