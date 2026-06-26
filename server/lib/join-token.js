const crypto = require("crypto");

const SALT = process.env.JOIN_TOKEN_SALT || "currency-safe-join-v1";

function normalizeJoinToken(token) {
    return String(token || "").trim().slice(0, 32);
}

function generateJoinToken() {
    return crypto.randomBytes(9).toString("base64url").slice(0, 12).toUpperCase();
}

function hashJoinToken(token) {
    const t = normalizeJoinToken(token);
    if (!t) return "";
    return crypto.createHash("sha256").update(`${SALT}:${t}`).digest("hex");
}

function verifyJoinToken(raw, token) {
    if (!raw?.joinPasswordEnabled) return true;
    const t = normalizeJoinToken(token);
    if (raw.joinTokenHash) return hashJoinToken(t) === raw.joinTokenHash;
    if (raw.joinPassword) return t === normalizeJoinToken(raw.joinPassword);
    return !t;
}

function needsJoinToken(raw, clientId) {
    if (!raw?.joinPasswordEnabled) return false;
    if (!raw.joinTokenHash && !raw.joinPassword) return false;
    if (clientId && clientId === raw.hostId) return false;
    const players = Array.isArray(raw.players) ? raw.players : [];
    const spectators = Array.isArray(raw.spectators) ? raw.spectators : [];
    if (clientId && players.some(p => p.id === clientId)) return false;
    if (clientId && spectators.some(s => s.id === clientId)) return false;
    return true;
}

function stripJoinSecrets(raw) {
    if (!raw || typeof raw !== "object") return raw;
    const copy = { ...raw };
    delete copy.joinPassword;
    delete copy.joinTokenHash;
    return copy;
}

module.exports = {
    normalizeJoinToken,
    generateJoinToken,
    hashJoinToken,
    verifyJoinToken,
    needsJoinToken,
    stripJoinSecrets
};
