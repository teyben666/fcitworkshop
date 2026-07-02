/**
 * Shared mute flag — sessionStorage csMuted ("1" = muted).
 * Used by home ☰, game ☰, lobby, tutorial.
 */
(function (global) {
    const KEY = "csMuted";

    if (sessionStorage.getItem(KEY) == null && localStorage.getItem("csSound") === "off") {
        sessionStorage.setItem(KEY, "1");
    }

    function isMuted() {
        return sessionStorage.getItem(KEY) === "1";
    }

    function setMuted(muted) {
        sessionStorage.setItem(KEY, muted ? "1" : "0");
    }

    function toggle() {
        setMuted(!isMuted());
        return isMuted();
    }

    function labelKeys() {
        return isMuted() ? { text: "muteOn", aria: "muteOn" } : { text: "muteOff", aria: "muteOff" };
    }

    global.CurrencySafePortalSound = { KEY, isMuted, setMuted, toggle, labelKeys };
})(window);
