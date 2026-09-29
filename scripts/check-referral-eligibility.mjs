import assert from "node:assert/strict";
import { canBindReferral } from "../app/lib/referrals/eligibility.ts";
import { fetchPendingReferral } from "../app/lib/referrals/client.ts";

const zero = `0x${"0".repeat(40)}`;
const a = `0x${"a".repeat(40)}`;
const b = `0x${"b".repeat(40)}`;
const c = `0x${"c".repeat(40)}`;
assert.equal(canBindReferral(a, b, zero), true);
assert.equal(canBindReferral(a, a, zero), false);
assert.equal(canBindReferral(a, a.toUpperCase(), zero), false);
assert.equal(canBindReferral(a, zero, zero), false);
assert.equal(canBindReferral(a, b, c), false);
// A refers B, then B can refer A: only the new user's existing binding matters.
const bindings = new Map();
assert.equal(canBindReferral(b, a, bindings.get(b) ?? zero), true);
bindings.set(b, a);
assert.equal(canBindReferral(a, b, bindings.get(a) ?? zero), true);
bindings.set(a, b);
assert.equal(canBindReferral(a, c, bindings.get(a)), false);

globalThis.fetch = async () => Response.json({ walletAddress: a, referral: { code: "ABC123", referrerWallet: b } });
assert.equal((await fetchPendingReferral(a)).evmWallet, b);
assert.equal(await fetchPendingReferral(c), null);
globalThis.fetch = async () => Response.json({ error: "Unavailable" }, { status: 503 });
assert.equal(await fetchPendingReferral(a), null);
globalThis.fetch = async () => { throw new Error("Offline"); };
assert.equal(await fetchPendingReferral(a), null);
console.log("Referral checks passed: reciprocal referrals allowed, self-referral and rebinding rejected, wallet isolation and unavailable verification.");
