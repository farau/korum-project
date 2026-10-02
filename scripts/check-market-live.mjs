// Integration check against local Next instances and an isolated Redis namespace.
// PostgreSQL is read-only: the fixture is an absent/reorged event, never inserted.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import Redis from "ioredis";
import postgres from "postgres";

if (!process.env.REDIS_URL || !process.env.DATABASE_URL) throw new Error("Load REDIS_URL and DATABASE_URL before running this check.");
const namespace = `korum-live-test-${randomBytes(8).toString("hex")}`;
const secret = randomBytes(32).toString("hex");
const env = { ...process.env, KORUM_GOLDSKY_WEBHOOK_SECRET: secret, KORUM_CACHE_NAMESPACE: namespace };
const ports = [Number(process.env.KORUM_LIVE_TEST_PORT || 3102), Number(process.env.KORUM_LIVE_TEST_PORT || 3102) + 1];
const servers = ports.map(port => spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], { env, stdio: "ignore" }));
const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, connectTimeout: 5000, commandTimeout: 5000 });
redis.on("error", () => {});
const database = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 5 });
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
  const [realTrade] = await database`
    SELECT trade.event_id, trade.chain_id, trade.token_address, trade.transaction_hash, trade.block_hash
    FROM indexer_v2.camp_trades trade
    JOIN indexer_v2.camp_market_state market
      ON market.chain_id = trade.chain_id AND market.token_address = trade.token_address
    WHERE trade.chain_id = 46630 AND trade.venue = 0 AND market.curve_status = 1
    ORDER BY trade.block_number DESC, trade.log_index DESC LIMIT 1
  `;
  assert.ok(realTrade, "An indexed trade on an active bonding curve is required for read-only chart integration");
  const venueResponse = await fetch(`http://127.0.0.1:${ports[0]}/api/markets/${realTrade.token_address}/venue`);
  assert.equal(venueResponse.status, 200);
  const venue = await venueResponse.json();
  assert.equal(venue.tokenAddress, realTrade.token_address);
  assert.equal(venue.curveStatus, 1);
  assert.equal(venue.chart, null, "Curve tokens must not invoke pool-chart discovery");
  const chartUrl = port => `http://127.0.0.1:${port}/api/markets/${realTrade.token_address}/chart?range=1s&limit=300`;
  const responses = await Promise.all([ports[0], ports[1], ports[0], ports[1]].map(port => fetch(chartUrl(port))));
  for (const response of responses) assert.equal(response.status, 200);
  const initialChart = await responses[0].json();
  assert.equal(initialChart.windowEnd - initialChart.windowStart, 299);
  const chartKey = `${prefix}:live:chart-v1:${realTrade.token_address}:1s`;
  assert.ok(await redis.ttl(chartKey) > 500);
  await new Promise(resolve => setTimeout(resolve, 2100));
  const reused = await fetch(chartUrl(ports[1]));
  assert.equal(reused.headers.get("x-korum-cache"), "HIT", "Late arrivals reuse Redis beyond the former 2s TTL");
  const quiet = JSON.parse(await redis.get(chartKey));
  quiet.builtAt = Date.now() - 12 * 60 * 60 * 1000;
  await redis.set(chartKey, JSON.stringify(quiet), "EX", 600);
  assert.equal((await fetch(chartUrl(ports[0]))).headers.get("x-korum-cache"), "HIT", "No periodic PostgreSQL rebuild in quiet markets");
  const stream = await fetch(`http://127.0.0.1:${ports[1]}/api/markets/live?tokens=${token},${realTrade.token_address}`, { signal: controller.signal });
  assert.equal(stream.status, 200); reader = stream.body.getReader();
  await frame("ready");
  assert.equal((await post(fixture)).status, 200);
  const notice = await frame("market");
  assert.deepEqual(notice.tokens, [token]); assert.equal(notice.reset, true);
  assert.equal(await redis.get(`${prefix}:live:revision`), notice.revision);
  assert.equal((await post(fixture)).status, 200);
  assert.equal(await redis.get(`${prefix}:live:revision`), notice.revision, "Duplicate delivery must not advance the revision");
  assert.equal((await post({ ...fixture, operation: "i" })).status, 503, "An uncommitted trade must be retried, never advertised");
  const insertion = { ...realTrade, chain_id: Number(realTrade.chain_id), operation: "i" };
  assert.equal((await post(insertion)).status, 200);
  const inserted = await frame("market");
  assert.equal(inserted.reset, false);
  assert.equal(inserted.trades.length, 1);
  assert.equal(inserted.trades[0].token, realTrade.token_address);
  assert.ok(Number.isFinite(inserted.trades[0].price));
  assert.equal(JSON.parse(await redis.get(chartKey)).revision, inserted.revision, "Chart update precedes SSE publication");
  assert.equal((await fetch(chartUrl(ports[1]))).headers.get("x-korum-cache"), "HIT");
  assert.equal((await post(insertion)).status, 200);
  assert.equal(JSON.parse(await redis.get(chartKey)).revision, inserted.revision, "Retries preserve the chart revision");
  assert.equal((await post({ ...insertion, operation: "u" })).status, 200);
  const correction = await frame("market");
  assert.equal(correction.reset, true);
  assert.equal(await redis.get(chartKey), null, "Correction requires a fresh PostgreSQL snapshot");
  assert.equal((await fetch(chartUrl(ports[1]))).headers.get("x-korum-cache"), "MISS");
  const response = await fetch(`http://127.0.0.1:${ports[0]}/api/markets/trades`);
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
  assert.ok((await redis.keys(`${prefix}:market:recent-trades:*:revision:${correction.revision}`)).length);
  controller.abort();
  console.log("Live integration passed: auth, payload limits, cross-instance SSE, Redis revision/dedupe, reorg notification, PostgreSQL lag retry cache coherence, cross-instance persistent chart reuse, quiet markets, confirmed trade values and correction recovery.");
} finally {
  controller.abort();
  if (reader) await reader.cancel().catch(() => {});
  for (const server of servers) server.kill("SIGTERM");
  const keys = await redis.keys(`${namespace}:*`);
  if (keys.length) await redis.unlink(...keys);
  await redis.quit();
  await database.end({ timeout: 1 });
}
