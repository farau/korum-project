// Real Redis tests; all keys belong to a unique namespace, no PostgreSQL writes.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import Redis from 'ioredis';
const directory = await mkdtemp(join(tmpdir(), 'korum-chart-cache-'));
const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:16379', { maxRetriesPerRequest: 1 });
redis.on('error', () => {});
const namespace = `korum-chart-cache-test:${randomUUID()}`;
const key = (...parts) => [namespace, ...parts].join(':');
try {
  for (const name of ['chart', 'chart-cache']) {
    const source = await readFile(new URL(`../app/lib/live/${name}.ts`, import.meta.url), 'utf8');
    const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText.replace('"./chart"', '"./chart.mjs"');
    await writeFile(join(directory, `${name}.mjs`), output);
  }
  const model = await import(pathToFileURL(join(directory, 'chart-cache.mjs')));
  const { slideChart } = await import(pathToFileURL(join(directory, 'chart.mjs')));
  // Separate module instances model independent app replicas, with independent
  // in-flight maps and the same distributed Redis lease.
  const replica = await import(`${pathToFileURL(join(directory, 'chart-cache.mjs'))}?replica=2`);
  const token = `0x${'a'.repeat(40)}`;
  const other = `0x${'b'.repeat(40)}`;
  const now = Math.floor(Date.now() / 1000);
  const empty = { points: [], quoteUsd: 2500, intervalSeconds: 1, windowStart: now - 299, windowEnd: now,
    hasMore: false, lastTradeTimestamp: null, lastTradeCursor: null,
    priorPrice: null, priorMarketCap: null, priorPriceUp: null, priorMarketCapUp: null, priorTimestamp: null };
  let reads = 0;
  const load = async () => { reads++; await new Promise(resolve => setTimeout(resolve, 30)); return structuredClone(empty); };
  const read = (range = '1s', loader = load, client = model) => client.readLiveChart(redis, key, token, range, loader);
  const [first, second] = await Promise.all([read(), read('1s', load, replica)]);
  assert.equal(reads, 1, 'Two replicas must share one cold PostgreSQL load');
  const comparisonTime = Math.floor(Date.now() / 1000);
  assert.deepEqual(slideChart(first, comparisonTime), slideChart(second, comparisonTime));
  const cacheKey = model.liveChartKey(key, token, '1s');
  assert.ok(await redis.ttl(cacheKey) > 500);
  await new Promise(resolve => setTimeout(resolve, 2100));
  await read();
  assert.equal(reads, 1, 'A new arrival after the old 2s TTL must reuse the chart');
  const minute = { ...empty, intervalSeconds: 60, windowEnd: Math.floor(now / 60) * 60,
    windowStart: Math.floor(now / 60) * 60 - 299 * 60, hasMore: false };
  await read('1m', async () => structuredClone(minute));
  const globalKey = key('live', 'revision');
  let revision = '0';
  const publish = async (trades, reset = false, target = token, id = randomUUID(), expected = revision, disabledTokens = []) => {
    const next = randomUUID();
    const { mutations, revisions } = await model.prepareChartMutations(redis, key, [target], next, trades, reset, disabledTokens);
    const result = await redis.eval(model.publishChartScript, 3, globalKey, key('channel'), key('event', id),
      next, JSON.stringify({ revision: next, tokens: [target], trades, reset }), expected, 1, `${id}:${reset ? 'd' : 'i'}`,
      JSON.stringify(revisions), JSON.stringify(mutations));
    if (result === 1) revision = next;
    return result;
  };
  const trade = { token, cursor: { block: 1, log: 0 }, previous: null, timestamp: now,
    price: 10, marketCap: 100, volumeQuote: 2 };
  const event = randomUUID();
  const builtAt = JSON.parse(await redis.get(cacheKey)).builtAt;
  await redis.expire(cacheKey, 45);
  assert.equal(await publish([trade], false, token, event), 1);
  assert.ok(await redis.ttl(cacheKey) <= 45, 'Publishing does not renew an unvisited chart indefinitely');
  assert.equal(JSON.parse(await redis.get(cacheKey)).builtAt, builtAt, 'Trades preserve the original build date');
  const fresh = await read();
  assert.equal(reads, 1);
  assert.equal(fresh.points[0].close, 10);
  assert.equal(fresh.points[0].volumeQuote, 2);
  assert.equal((await read('1m')).points[0].close, 10, 'Both resolutions are updated by one batch');
  assert.equal(await publish([trade], false, token, event), 0, 'Duplicate webhook is a no-op');
  assert.equal((await read()).points[0].volumeQuote, 2);
  assert.equal(await publish([], true, other), 1);
  assert.equal((await read()).points[0].volumeQuote, 2, 'Other tokens do not invalidate this chart');
  assert.equal(await publish([], true, other, randomUUID(), 'outdated'), -1, 'Concurrent publishers must retry');
  const nextTrade = { ...trade, cursor: { block: 1, log: 1 }, previous: trade.cursor, price: 12, volumeQuote: 3 };
  assert.equal(await publish([nextTrade]), 1);
  assert.equal((await read()).points[0].volumeQuote, 5);
  assert.equal((await read()).points[0].high, 12);
  const gap = { ...nextTrade, cursor: { block: 3, log: 0 }, previous: { block: 2, log: 0 } };
  assert.equal(await publish([gap]), 1);
  assert.equal(await redis.get(cacheKey), null, 'Missing predecessors invalidate the cached chart');
  await read();
  assert.equal(reads, 2);
  assert.equal(await publish([], true), 1);
  assert.equal(await redis.get(cacheKey), null, 'Corrections invalidate all affected resolutions');
  assert.equal(await redis.get(model.liveChartKey(key, token, '1m')), null);
  await read();
  const quiet = JSON.parse(await redis.get(cacheKey));
  quiet.builtAt = Date.now() - 12 * 60 * 60 * 1000;
  await redis.set(cacheKey, JSON.stringify(quiet), 'EX', 600);
  const before = reads;
  await Promise.all([read(), read('1s', load, replica), read()]);
  assert.equal(reads, before, 'Hours without trades must not trigger periodic PostgreSQL reconstruction');
  await redis.del(cacheKey);
  await Promise.all([read(), read('1s', load, replica), read()]);
  assert.equal(reads, before + 1, 'Expired caches rebuild once across replicas and users');
  // A correction during a snapshot load must prevent stale refill.
  await redis.del(cacheKey);
  let rebuilds = 0;
  const racingLoad = async () => {
    rebuilds++;
    if (rebuilds === 1) { await publish([], true); return { ...empty, quoteUsd: 1 }; }
    return { ...empty, quoteUsd: 2 };
  };
  assert.equal((await read('1s', racingLoad)).quoteUsd, 2);
  assert.equal(rebuilds, 2);
  assert.equal(JSON.parse(await redis.get(cacheKey)).page.quoteUsd, 2);
  // A simultaneous independent snapshot cannot be overwritten by a publisher.
  const nextRevision = randomUUID();
  const prepared = await model.prepareChartMutations(redis, key, [token], nextRevision, [trade], false);
  const concurrent = JSON.parse(await redis.get(cacheKey));
  concurrent.page.quoteUsd = 3333;
  await redis.set(cacheKey, JSON.stringify(concurrent), 'EX', 600);
  assert.equal(await redis.eval(model.publishChartScript, 3, globalKey, key('channel'), key('event', 'race'),
    nextRevision, '{}', revision, 1, 'race:i', JSON.stringify(prepared.revisions), JSON.stringify(prepared.mutations)), 1);
  revision = nextRevision;
  assert.equal(JSON.parse(await redis.get(cacheKey)).page.quoteUsd, 3333);
  assert.equal(model.parseChartEntry(await redis.get(cacheKey), nextRevision), null, 'A raced snapshot is marked obsolete by token revision');
  await redis.set(cacheKey, 'broken JSON', 'EX', 600);
  await read();
  assert.ok(JSON.parse(await redis.get(cacheKey)).page);
  await read('1m', async () => structuredClone(minute));
  assert.equal(await publish([], false, token, randomUUID(), revision, [token]), 1);
  assert.equal(await redis.get(cacheKey), null, 'Graduation discards the 1s window without updating its candles');
  assert.equal(await redis.get(model.liveChartKey(key, token, '1m')), null, 'Graduation discards all cached resolutions');
  console.log('Real Redis chart-cache checks passed: cross-replica cold loads, reuse beyond 2s, live OHLC/volume, multiple resolutions, idle TTL, dedupe, token isolation, concurrent publishers, gaps, corrections, quiet-market reuse and shared reconstruction, raced fills and corrupt-cache recovery.');
} finally {
  const keys = await redis.keys(`${namespace}:*`);
  if (keys.length) await redis.unlink(...keys);
  await redis.quit();
  await rm(directory, { recursive: true, force: true });
}
