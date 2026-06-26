/**
 * Load browser room-shared + malaysia-states in Node (vm sandbox).
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const sandbox = { window: {}, console };

function runScript(relPath) {
    const file = path.join(ROOT, relPath);
    const code = fs.readFileSync(file, "utf8");
    vm.runInNewContext(code, sandbox);
}

runScript("js/malaysia-states.js");
runScript("js/room-shared.js");

const S = sandbox.window.CurrencySafeRoomShared;
if (!S) {
    throw new Error("Failed to load CurrencySafeRoomShared");
}

module.exports = { S };
