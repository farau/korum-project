// Integration check against local Next instances and an isolated Redis namespace.
// PostgreSQL is read-only: the fixture is an absent/reorged event, never inserted.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import Redis from "ioredis";

if (!process.env.REDIS_URL || !process.env.DATABASE_URL) throw new Error("Load REDIS_URL and DATABASE_URL before running this check.");
const namespace = `korum-live-test-${randomBytes(8).toString("hex")}`;
const secret = randomBytes(32).toString("hex");
const env = { ...process.env, KORUM_GOLDSKY_WEBHOOK_SECRET: secret, KORUM_CACHE_NAMESPACE: namespace };
const ports = [Number(process.env.KORUM_LIVE_TEST_PORT || 3102), Number(process.env.KORUM_LIVE_TEST_PORT || 3102) + 1];
const servers = ports.map(port => spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], { env, stdio: "ignore" }));
const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, connectTimeout: 5000, commandTimeout: 5000 });
redis.on("error", () => {});
const prefix = `${namespace}:${process.env.NEXT_PUBLIC_KORUM_NETWORK === "mainnet" ? 4663 : 46630}:v2`;
const controller = new AbortController();
let reader;
const token = `0x${"a".repeat(40)}`;
const fixture = {
  event_id: `live-test:${randomBytes(12).toString("hex")}`, chain_id: 46630, token_address: token,
  transaction_hash: `0x${randomBytes(32).toString("hex")}`, block_hash: `0x${randomBytes(32).toString("hex")}`, operation: "d",
};
const post = (body, auth = `Bearer ${secret}`) => fetch(`http://127.0.0.1:${ports[0]}/api/webhooks/goldsky`, {
  method: "POST", headers: { Authorization: auth, "Content-Type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body),
});
let buffer = "";
async function frame(event) {
  const deadline = setTimeout(() => controller.abort(), 10_000);
  try {
    while (true) {
      const end = buffer.indexOf("\n\n");
      if (end >= 0) {
        const value = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        if (value.includes(`event: ${event}\n`)) return JSON.parse(value.split("data: ")[1]);
      } else {
        const result = await reader.read();
        if (result.done) throw new Error("Stream ended unexpectedly");
        buffer += new TextDecoder().decode(result.value);
      }
    }
  } finally { clearTimeout(deadline); }
}
try {
  for (const port of ports) {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try { ready = (await fetch(`http://127.0.0.1:${port}/api/auth/session`)).ok; } catch {}
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.ok(ready, `Server on ${port} did not start`);
  }
  assert.equal((await post(fixture, "Bearer wrong")).status, 401);
  assert.equal((await post({ ...fixture, chain_id: 1 })).status, 400);
  assert.equal((await post("x".repeat(128 * 1024 + 1))).status, 413);
  const stream = await fetch(`http://127.0.0.1:${ports[1]}/api/markets/live?tokens=${token}`, { signal: controller.signal });
  assert.equal(stream.status, 200); reader = stream.body.getReader();
  await frame("ready");
  assert.equal((await post(fixture)).status, 200);
  const notice = await frame("market");
  assert.deepEqual(notice.tokens, [token]); assert.equal(notice.reset, true);
  assert.equal(await redis.get(`${prefix}:live:revision`), notice.revision);
  assert.equal((await post(fixture)).status, 200);
  assert.equal(await redis.get(`${prefix}:live:revision`), notice.revision, "Duplicate delivery must not advance the revision");
  assert.equal((await post({ ...fixture, operation: "i" })).status, 503, "An uncommitted trade must be retried, never advertised");
  const response = await fetch(`http://127.0.0.1:${ports[0]}/api/markets/trades`);
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
  assert.ok((await redis.keys(`${prefix}:market:recent-trades:*:revision:${notice.revision}`)).length);
  controller.abort();
  console.log("Live integration passed: auth, payload limits, cross-instance SSE, Redis revision/dedupe, reorg notification, PostgreSQL lag retry and cache coherence.");
} finally {
  controller.abort();
  if (reader) await reader.cancel().catch(() => {});
  for (const server of servers) server.kill("SIGTERM");
  const keys = await redis.keys(`${namespace}:*`);
  if (keys.length) await redis.unlink(...keys);
  await redis.quit();
}
