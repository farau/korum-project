import assert from "node:assert/strict";
import { WalletSessionGuard, walletMatches, isWalletConnectorReady } from "../app/lib/auth/wallet-session-guard.ts";

const a = `0x${"a".repeat(40)}`;
const b = `0x${"b".repeat(40)}`;
assert.equal(walletMatches(a, [a.toUpperCase()]), true);
assert.equal(walletMatches(a, [b, a]), false, "Previously authorized accounts are not the active account");
assert.equal(walletMatches(a, []), false, "Locking/disconnecting the extension invalidates the account");
assert.equal(walletMatches(null, [a]), false);

const descriptor = { id: "metaMask", uid: "cookie-id", name: "MetaMask", type: "injected" };
const liveConnector = { ...descriptor, getAccounts: async () => [a], getProvider: async () => ({}) };
assert.equal(isWalletConnectorReady("reconnecting", descriptor), false);
assert.equal(isWalletConnectorReady("connected", descriptor), false);
assert.equal(isWalletConnectorReady("reconnecting", liveConnector), false);
assert.equal(isWalletConnectorReady("connected", liveConnector), true);
assert.equal(isWalletConnectorReady("connected", { getAccounts: true, getProvider: "invalid" }), false);
assert.equal(isWalletConnectorReady("disconnected", undefined), false);

const guard = new WalletSessionGuard();
const oldRead = guard.revision;
guard.invalidate();
assert.equal(guard.isCurrent(oldRead), false, "A session read from the previous wallet must be ignored");

let releaseSignature;
const signature = new Promise(resolve => { releaseSignature = resolve; });
let cookie = a;
const order = [];
const revision = guard.revision;
const verification = guard.run(async () => {
  order.push("verify A started");
  await signature;
  cookie = a; // The HTTP response sets its cookie even after account changes.
  if (!guard.isCurrent(revision)) {
    cookie = null;
    order.push("stale A cleared");
    return false;
  }
  return true;
});
await Promise.resolve();
guard.invalidate();
const logout = guard.run(async () => { cookie = null; order.push("logout"); });
const newLogin = guard.run(async () => { cookie = b; order.push("login B"); });
releaseSignature();
assert.equal(await verification, false);
await Promise.all([logout, newLogin]);
assert.equal(cookie, b, "Late A verification/logout must not replace or erase B's session");
assert.deepEqual(order, ["verify A started", "stale A cleared", "logout", "login B"]);

await assert.rejects(guard.run(async () => { throw new Error("Network unavailable"); }));
await guard.run(async () => { cookie = null; });
await guard.settled();
assert.equal(cookie, null, "A failed request must not prevent a subsequent logout");
console.log("Wallet session isolation passed: active-account matching, stale reads, delayed signatures, ordered logout/login, network recovery.");
