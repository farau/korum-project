// Real Redis coordination tests, with simulated SQL loaders and isolated keys.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import Redis from 'ioredis';

const directory = await mkdtemp(join(tmpdir(), 'korum-debate-cache-'));
const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:16379', {
  connectTimeout: 2000, maxRetriesPerRequest: 1, retryStrategy: () => null,
});
redis.on('error', () => {});
const namespace = `korum-debate-cache-test:${randomUUID()}`;
const key = (...parts) => [namespace, ...parts].join(':');
async function moduleFile(name, path) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022,
  } }).outputText.replace('"../cache/maintained"', '"./maintained.mjs"').replace('"./chart"', '"./chart.mjs"');
  const file = join(directory, `${name}.mjs`);
  await writeFile(file, output);
  return pathToFileURL(file).href;
}
try {
  const maintainedUrl = await moduleFile('maintained', 'app/lib/cache/maintained.ts');
  const main = await import(maintainedUrl);
  const replicas = await Promise.all([2, 3, 4].map(id => import(`${maintainedUrl}?replica=${id}`)));
  const debate = await import(await moduleFile('debate-cache', 'app/lib/live/debate-cache.ts'));
  const reconcile = await import(await moduleFile('debate-reconcile', 'app/lib/live/debate-reconcile.ts'));
  await moduleFile('chart', 'app/lib/live/chart.ts');
  const chart = await import(await moduleFile('chart-cache', 'app/lib/live/chart-cache.ts'));
  const keys = debate.snapshotKeys(key, debate.debateCatalogKey(key));
  const rows = [1, 2].map(id => ({ versusId: String(id), tokenAAddress: `token-${id}-a`, tokenBAddress: `token-${id}-b`, price: id }));
  let reads = 0;
  const load = async () => {
    reads++;
    await new Promise(resolve => setTimeout(resolve, 30));
    return structuredClone(rows);
  };
  const read = (client = main, loader = load) => client.readMaintained(redis, keys, loader, undefined, value => debate.debateMappings(key, value));
  const callers = [main, ...replicas];
  await Promise.all(Array.from({ length: 100 }, (_, index) => read(callers[index % callers.length])));
  assert.equal(reads, 1, '100 readers across 4 replicas cause one cold SQL load');
  // Age the snapshot without waiting: lifetime is idle retention, not freshness.
  await redis.expire(keys.value, 580);
  assert.deepEqual(await read(), rows);
  assert.equal(reads, 1, 'A snapshot older than 15 seconds stays reusable');
  assert.ok(await redis.ttl(keys.value) > 590, 'Read renews the 10-minute idle TTL');
  let affectedReads = 0;
  const refresh = async ids => {
    affectedReads++;
    assert.deepEqual(ids, ['1']);
    return [{ ...rows[0], price: 10 }];
  };
  const publish = async (tokens, loader, eventId = randomUUID(), expected) => {
    const revision = randomUUID();
    const previous = expected ?? await redis.get(keys.guard) ?? '0';
    const updates = await debate.prepareDebateMutations(redis, key, tokens, revision, loader);
    return redis.eval(chart.publishChartScript, 3, keys.guard, key('channel'), key('event', eventId),
      revision, JSON.stringify({ revision, tokens }), previous, 1, `${eventId}:i`,
      JSON.stringify(updates.revisions), JSON.stringify(updates.mutations), JSON.stringify(updates.mappings));
  };
  const detailKeys = debate.snapshotKeys(key, debate.debateRowKey(key, '1'));
  await main.readMaintained(redis, detailKeys, async () => [rows[0]]);
  await redis.expire(keys.value, 40);
  assert.equal(await publish(['token-1-a'], refresh), 1);
  assert.ok(await redis.ttl(keys.value) <= 40, 'Publishing preserves idle TTL');
  const updated = await read();
  assert.equal(updated[0].price, 10);
  assert.equal(updated[1].price, 2, 'An unrelated Versus remains unchanged');
  assert.equal((await main.readMaintained(redis, detailKeys, async () => assert.fail('Warm detail SQL load')))[0].price, 10);
  assert.equal(reads, 1, 'Trade updates do not force catalog reconstruction');
  assert.equal(affectedReads, 1, 'One affected-row SQL refresh is shared by the batch');
  // Active catalogs can resolve their tokens after the 24h mapping has expired.
  await redis.del(key('live', 'token-versus-v1', 'token-1-a'));
  assert.equal(await publish(['token-1-a'], refresh), 1);
  assert.equal((await read())[0].price, 10);
  assert.equal(reads, 1);
  assert.equal(await publish(['token-99-a'], async () => assert.fail('Cold unknown token is not loaded')), 1);
  assert.equal(await redis.get(keys.value), null, 'An unknown/new token invalidates discovery');
  await read();
  assert.equal(reads, 2);
  assert.equal(await publish(['token-1-a'], refresh, randomUUID(), 'stale'), -1, 'Concurrent publishers retry instead of overwriting');
  assert.equal((await read())[0].price, 1);
  assert.equal(await publish(['token-1-a'], async () => []), 1);
  assert.equal((await read()).length, 1, 'Authoritative deletion removes the affected catalog row');
  assert.deepEqual(await main.readMaintained(redis, detailKeys, async () => assert.fail('Deleted detail is cached')), []);
  await redis.del(keys.value);
  await read();
  await redis.set(keys.value, JSON.stringify({ revision: await redis.get(keys.revision) ?? '0',
    metadata: await redis.get(keys.metadata) ?? '0', value: {} }), 'EX', 600);
  const beforeCorruption = reads;
  await read();
  assert.equal(reads, beforeCorruption + 1, 'A corrupt payload is reconstructed once');
  // A fill started before a notice cannot overwrite the newly published data.
  const raced = debate.snapshotKeys(key, key('raced-fill'));
  let started;
  let resume;
  const startedPromise = new Promise(resolve => { started = resolve; });
  const wait = new Promise(resolve => { resume = resolve; });
  let racedReads = 0;
  const filling = main.readMaintained(redis, raced, async () => {
    racedReads++;
    if (racedReads === 1) { started(); await wait; return ['old']; }
    return ['fresh'];
  });
  await startedPromise;
  await redis.set(keys.guard, randomUUID());
  resume();
  assert.deepEqual(await filling, ['fresh']);
  assert.equal(racedReads, 2, 'A raced cold fill rebuilds once under the same lease');
  // Metadata probes are limited across replicas; unchanged control-plane data
  // does not invalidate any market snapshot.
  let probes = 0;
  let fingerprint = 'initial';
  const probe = async () => { probes++; await new Promise(resolve => setTimeout(resolve, 20)); return fingerprint; };
  await Promise.all(Array.from({ length: 100 }, () => reconcile.reconcileDebateMetadata(redis, key, probe)));
  assert.equal(probes, 1);
  await read();
  const before = reads;
  await redis.del(key('live', 'debate-metadata-probe-v1'));
  await reconcile.reconcileDebateMetadata(redis, key, probe);
  await read();
  assert.equal(reads, before, 'Minute reconciliation with unchanged metadata performs no heavy SQL');
  fingerprint = 'new-versus-or-graduation';
  await redis.del(key('live', 'debate-metadata-probe-v1'));
  await reconcile.reconcileDebateMetadata(redis, key, probe);
  await Promise.all(callers.map(client => read(client)));
  assert.equal(reads, before + 1, 'Changed metadata causes one reconstruction shared by replicas');

  // Exercise actual watchlist reads/mutations with simulated PostgreSQL, real
  // Redis, and two authenticated identities; no real user rows are modified.
  const users = new Map([['alice', [1]], ['bob', [2]]]);
  let userReads = 0;
  const watchSource = await readFile(new URL('../app/lib/db/watchlist.ts', import.meta.url), 'utf8');
  const watchCode = ts.transpileModule(watchSource, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  } }).outputText;
  const watchExports = {};
  const dependencies = {
    'server-only': {}, 'node:crypto': { randomUUID },
    '../../config/deployment': { INDEXER_SCHEMA: 'indexer_v2', WATCHLIST_TABLE: 'watchlist' },
    '../cache/redis': { connectedRedis: async () => redis, redisCacheKey: key }, '../cache/maintained': main,
    './client': { getDatabase: () => ({ unsafe: async (sql, [user, , id]) => {
      if (sql.includes('INSERT INTO')) { users.get(user).unshift(id); return [{ exists: true }]; }
      if (sql.includes('DELETE FROM')) { users.set(user, users.get(user).filter(value => value !== id)); return []; }
      userReads++;
      return users.get(user).map(versusId => ({ versusId: String(versusId) }));
    } }) },
  };
  runInNewContext(watchCode, { exports: watchExports, require: name => {
    assert.ok(name in dependencies, `Unexpected watchlist dependency ${name}`); return dependencies[name];
  } });
  const { getUserWatchlist, addUserWatchlistItem, removeUserWatchlistItem } = watchExports;
  await Promise.all(Array.from({ length: 100 }, () => getUserWatchlist('alice', 46630)));
  assert.equal(userReads, 1);
  assert.deepEqual(Array.from(await getUserWatchlist('bob', 46630)), [2], 'Private IDs never leak between users');
  const userBefore = userReads;
  await publish(['token-1-a'], refresh);
  assert.deepEqual(Array.from(await getUserWatchlist('alice', 46630)), [1]);
  assert.equal(userReads, userBefore, 'Trades do not invalidate private watchlist IDs');
  await addUserWatchlistItem('alice', 46630, 2);
  assert.deepEqual(Array.from(await getUserWatchlist('alice', 46630)), [2, 1]);
  await removeUserWatchlistItem('alice', 46630, 1);
  assert.deepEqual(Array.from(await getUserWatchlist('alice', 46630)), [2]);
  assert.equal(userReads, userBefore + 2, 'Only private mutations reload that user’s IDs');
  await getUserWatchlist('bob', 46630);
  assert.equal(userReads, userBefore + 2, 'Another user’s IDs stay cached');

  // Test the actual public adapters: list, detail, Top VS's list and private
  // watchlist hydration all reuse one catalog, not one cache per user/limit.
  const math = await import(await moduleFile('math', 'app/lib/markets/math.ts'));
  const windows = await import(await moduleFile('debate-snapshot', 'app/lib/live/debate-snapshot.ts'));
  const fixture = {
    versusId: '1', chainId: 46630, createdAt: '2026-10-01T00:00:00Z',
    creatorWallet: `0x${'a'.repeat(40)}`, creatorCreatedAt: null, category: 'Test',
    tokenAName: 'A', tokenBName: 'B', tokenASymbol: 'A', tokenBSymbol: 'B',
    tokenAAddress: `0x${'b'.repeat(40)}`, tokenBAddress: `0x${'c'.repeat(40)}`,
  };
  for (const side of ['A', 'B']) Object.assign(fixture, {
    [`token${side}TotalSupply`]: '4000000000000000000',
    [`token${side}VirtualEth`]: '1000000000000000000',
    [`token${side}CirculatingSupply`]: '1000000000000000000',
    [`token${side}AdjustedFdvSupply`]: '1000000000000000000',
    [`token${side}GraduationEth`]: '1000000000000000000',
    [`token${side}SqrtPriceX96`]: String(2n ** 96n),
    [`token${side}PriorPrice`]: null,
    [`token${side}WindowTrades`]: [{ time: Date.now() / 1000 - 60, sqrtPrice: String(2n ** 96n), volume: '7' }],
  });
  let catalogReads = 0;
  let metadataReads = 0;
  const adapterKey = (...parts) => key('adapter', ...parts);
  const adapterExports = {};
  const adapterDependencies = {
    'server-only': {}, react: { cache: fn => fn },
    '../../config/deployment': { INDEXER_SCHEMA: 'indexer_v2', WATCHLIST_TABLE: 'watchlist' },
    '../../config/korum-network': { KORUM_CHAIN: { name: 'Test' }, KORUM_CHAIN_ID: 46630 },
    '../badges': { calculateBadgeProgress: () => ({ creator: null }) },
    '../cache/redis': { connectedRedis: async () => redis, redisCacheKey: adapterKey },
    '../cache/maintained': main, '../live/debate-cache': debate,
    '../live/debate-reconcile': reconcile, '../live/debate-snapshot': windows,
    '../markets/quote-usd': { getEthUsdQuote: async () => null }, '../markets/math': math,
    '../public-asset-url': { publicAssetUrl: () => undefined },
    './watchlist': { getUserWatchlist: async () => [1] },
    './client': { getDatabase: () => ({ unsafe: async (sql, parameters) => {
      if (sql.includes('SELECT MD5(CONCAT')) { metadataReads++; return [{ fingerprint: 'same' }]; }
      catalogReads++; await new Promise(resolve => setTimeout(resolve, 30));
      return parameters[1] === '2' ? [{ ...fixture, versusId: '2', tokenAAddress: `0x${'d'.repeat(40)}`, tokenBAddress: `0x${'e'.repeat(40)}` }] : [fixture];
    } }) },
  };
  const adapterSource = await readFile(new URL('../app/lib/db/debates.ts', import.meta.url), 'utf8');
  const adapterCode = ts.transpileModule(adapterSource, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  } }).outputText;
  runInNewContext(adapterCode, { exports: adapterExports, Date, Map, Set,
    process: { env: { REDIS_URL: 'configured', KORUM_GOLDSKY_WEBHOOK_SECRET: 'x'.repeat(32) } },
    require: name => { assert.ok(name in adapterDependencies, `Unexpected adapter dependency ${name}`); return adapterDependencies[name]; },
  });
  // Establish the metadata fingerprint before the cold burst, so this test
  // counts market reads independently of the first ever metadata probe.
  await reconcile.reconcileDebateMetadata(redis, adapterKey, async () => 'same');
  const snapshots = await Promise.all(Array.from({ length: 90 }, (_, index) => {
    if (index % 3 === 0) return adapterExports.getIndexedDebates(index % 2 ? 100 : 250);
    if (index % 3 === 1) return adapterExports.getIndexedDebateById('1').then(value => [value]);
    return adapterExports.getIndexedWatchlistDebates(`user-${index}`, [1]);
  }));
  assert.equal(catalogReads, 1, 'List limits, detail pages and 30 users’ watchlists share one SQL catalog');
  assert.equal(metadataReads, 0);
  for (const [item] of snapshots) {
    assert.equal(item.tokenA.change5m, 300);
    assert.equal(item.tokenA.volume24hEth, 7e-18);
  }
  await redis.del(adapterKey('live', 'debate-metadata-probe-v1'));
  await adapterExports.getIndexedDebates();
  assert.equal(metadataReads, 1);
  assert.equal(catalogReads, 1, 'An unchanged periodic probe leaves the actual adapters cached');
  await adapterExports.getIndexedDebateById('2');
  const olderMapping = adapterKey('live', 'token-versus-v1', `0x${'d'.repeat(40)}`);
  await redis.expire(olderMapping, 30);
  await adapterExports.getIndexedDebateById('2');
  assert.equal(catalogReads, 2, 'An older warm detail does not repeat SQL');
  assert.ok(await redis.ttl(olderMapping) > 86000, 'Reads also retain discovery mappings for older active details');

  // Actual publisher skips repeat deliveries before any market reconstruction.
  let publicationsLoaded = 0;
  const serverExports = {};
  const serverDependencies = {
    'server-only': {}, 'node:crypto': { createHash, randomUUID },
    '../cache/redis': { connectedRedis: async () => redis, redisCacheKey: key },
    '../../config/deployment': { INDEXER_SCHEMA: 'indexer_v2' },
    '../db/client': { getDatabase: () => ({ unsafe: async () => assert.fail('A deletion does not read chart trades') }) },
    '../markets/math': math, '../markets/venue': { usesKorumCandles: () => true },
    './chart-cache': chart, './debate-cache': debate,
    '../db/debates': { loadIndexedDebateRowsByIds: async () => { publicationsLoaded++; return [rows[0]]; } },
  };
  const serverSource = await readFile(new URL('../app/lib/live/server.ts', import.meta.url), 'utf8');
  const serverCode = ts.transpileModule(serverSource, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  } }).outputText;
  runInNewContext(serverCode, { exports: serverExports, Map, Set,
    require: name => { assert.ok(name in serverDependencies, `Unexpected publisher dependency ${name}`); return serverDependencies[name]; },
  });
  const notice = { event_id: randomUUID(), token_address: 'token-1-a', operation: 'd', block_hash: 'hash' };
  assert.equal(await serverExports.publishMarketNotice([notice]), 1);
  assert.equal(publicationsLoaded, 1);
  assert.equal(await serverExports.publishMarketNotice([notice]), 0);
  assert.equal(publicationsLoaded, 1, 'A duplicate webhook causes no repeated market SQL');
  console.log('Debate cache checks passed: 100 readers across 4 replicas share one SQL load; warm reuse, idle TTL, affected-row refresh, detail/catalog consistency, unknown tokens, raced fills, metadata reconciliation and private watchlist invalidation.');
} finally {
  if (redis.status === 'ready') {
    const keys = await redis.keys(`${namespace}:*`);
    if (keys.length) await redis.unlink(...keys);
    await redis.quit();
  } else redis.disconnect();
  await rm(directory, { recursive: true, force: true });
}
