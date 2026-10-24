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

// Exercise the provider's mount effect: anonymous visits do not mutate cookies
// or refresh RSC, but a restored session without a wallet must still be cleared.
const { readFile } = await import('node:fs/promises');
const { createRequire } = await import('node:module');
const { runInNewContext } = await import('node:vm');
const { default: ts } = await import('typescript');
const require = createRequire(import.meta.url);
const React = require('react');
const source = await readFile(new URL('../app/components/WalletProvider.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
for (const hasSessionCookie of [false, true]) {
  const effects = [];
  let deletes = 0, refreshes = 0;
  const exports = {};
  const dependencies = {
    react: { ...React, useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
      useRef: initial => ({ current: initial }), useMemo: fn => fn(), useCallback: fn => fn, useEffect: fn => effects.push(fn) },
    '@rainbow-me/rainbowkit': { createAuthenticationAdapter: value => value, RainbowKitAuthenticationProvider: () => null },
    'next/navigation': { useRouter: () => ({ refresh: () => refreshes++ }) },
    wagmi: { useAccount: () => ({ isConnected: false, status: 'disconnected' }), useDisconnect: () => ({ disconnectAsync: async () => {} }) },
    './WalletContext': { WalletContext: React.createContext(null) },
    '../lib/auth/wallet-session-guard': { WalletSessionGuard, walletMatches, isWalletConnectorReady },
  };
  runInNewContext(code, { exports, console, window: { setTimeout, clearTimeout },
    fetch: async (_url, options) => { assert.equal(options.method, 'DELETE'); deletes++; return { ok: true }; },
    require: name => dependencies[name] ?? require(name),
  });
  exports.WalletAuthenticationProvider({ children: null, hasSessionCookie });
  const cleanup = effects.map(effect => effect());
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(deletes, Number(hasSessionCookie));
  assert.equal(refreshes, Number(hasSessionCookie));
  cleanup.forEach(fn => fn?.());
}
console.log('Anonymous mount: zero DELETE/refresh without a session; restored cookie still cleared.');
