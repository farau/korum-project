// Isolated real PostgreSQL regression and benchmark. Never uses DATABASE_URL.
// KORUM_TEST_DATABASE_URL must point to a local cluster with CREATE DATABASE rights.
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import postgres from 'postgres';
import ts from 'typescript';

const url = new URL(process.env.KORUM_TEST_DATABASE_URL || 'postgres://korum_test@127.0.0.1:16482/postgres');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Only an explicitly local test cluster is allowed');
const name = `korum_snapshot_test_${randomUUID().replaceAll('-', '')}`;
const admin = postgres(url.href, { max: 1, onnotice: () => {} });
await admin.unsafe(`CREATE DATABASE "${name}"`);
url.pathname = `/${name}`;
const db = postgres(url.href, { max: 4, onnotice: () => {}, transform: { undefined: null } });
const chain = 46630;
const addr = n => `0x${n.toString(16).padStart(40, '0')}`;
const hash = n => `0x${n.toString(16).padStart(64, '0')}`;
const tokenA = addr(1), tokenB = addr(2), wallet = addr(3);
const baseTime = Math.floor(Date.now() / 1000) - 1000;
let seq = 1;
function trade(overrides = {}) {
  const id = seq++;
  return { event_id: `event-${id}`, chain_id: chain, token_address: tokenA, trader_address: wallet,
    referrer_address: addr(0), venue: 0, kind: 0, is_buy: true, eth_gross: '100', token_amount: '1',
    fee_total: '0', fee_creator: '0', fee_referrer: '0', fee_platform: '0', tier_fee_bps: 0,
    tier_creator_share_bps: 0, snipe_tax_bps: 0, sqrt_price_x96_after: String(2n ** 96n + BigInt(id)),
    real_eth_after: '100', token_reserve_after: '100', cumulative_volume_after: '100',
    traded_at: new Date(baseTime * 1000), transaction_hash: hash(id), block_hash: hash(999),
    block_number: id, log_index: 0, ...overrides };
}
async function insert(row) { await db`INSERT INTO indexer_v2.camp_trades ${db(row)}`; }
async function equivalence(label) {
  const actual = await db`SELECT chain_id::text, token_address, trader_address, trade_count::text
    FROM indexer_v2.camp_trader_memberships ORDER BY 1,2,3`;
  const expected = await db`SELECT chain_id::text, token_address, trader_address, COUNT(*)::text AS trade_count
    FROM indexer_v2.camp_trades WHERE trader_address <> ${addr(0)} GROUP BY 1,2,3 ORDER BY 1,2,3`;
  assert.deepEqual([...actual], [...expected], `${label}: memberships`);
  const buckets = await db`SELECT chain_id::text, token_address, traded_at, volume_wei::text, trade_count::text,
    close_sqrt_price::text, close_block::text, close_log FROM indexer_v2.camp_trade_buckets ORDER BY 1,2,3`;
  const raw = await db`SELECT chain_id::text, token_address, traded_at, SUM(eth_gross)::text AS volume_wei,
    COUNT(*)::text AS trade_count, (array_agg(sqrt_price_x96_after::text ORDER BY block_number DESC, log_index DESC))[1] AS close_sqrt_price,
    (array_agg(block_number::text ORDER BY block_number DESC, log_index DESC))[1] AS close_block,
    (array_agg(log_index ORDER BY block_number DESC, log_index DESC))[1] AS close_log
    FROM indexer_v2.camp_trades GROUP BY 1,2,3 ORDER BY 1,2,3`;
  assert.deepEqual([...buckets], [...raw], `${label}: volumes, counts and closing prices`);
}
async function load(path, dependencies = {}, append = '') {
  const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  runInNewContext(code + append, { exports, Date, Map, Set, console, process: { env: {} }, require: name => {
    if (name in dependencies) return dependencies[name];
    if (name === 'server-only') return {};
    throw new Error(`Missing test dependency ${name}`);
  } });
  return exports;
}
let succeeded = false;
try {
  const files = (await readdir(new URL('../db/migrations/', import.meta.url))).filter(n => n.endsWith('.sql')).sort();
  for (const file of files.filter(n => n < '0016')) {
    const sql = await readFile(new URL(`../db/migrations/${file}`, import.meta.url), 'utf8');
    await db.begin(tx => tx.unsafe(sql));
  }
  const first = trade();
  const last = trade({ eth_gross: '250' });
  await insert(first);
  await insert(last);
  await insert(trade({ token_address: tokenB, trader_address: addr(0), traded_at: new Date((baseTime + 0.125) * 1000) }));
  const migration = await readFile(new URL('../db/migrations/0016_create_market_snapshot_aggregates.sql', import.meta.url), 'utf8');
  await db.begin(tx => tx.unsafe(migration));
  await equivalence('Backfill with duplicate timestamps, zero address and fractional timestamp');
  await db`INSERT INTO indexer_v2.camp_trades ${db(last)} ON CONFLICT (chain_id, transaction_hash, log_index)
    DO UPDATE SET ingested_at = NOW(), eth_gross = EXCLUDED.eth_gross`;
  await equivalence('Replayed upsert');
  await db`UPDATE indexer_v2.camp_trades SET eth_gross = 350, sqrt_price_x96_after = 999 WHERE event_id = ${last.event_id}`;
  await equivalence('Correction of bucket close and amount');
  await db`UPDATE indexer_v2.camp_trades SET token_address = ${tokenB}, trader_address = ${addr(5)},
    traded_at = traded_at + INTERVAL '1 second' WHERE event_id = ${last.event_id}`;
  await equivalence('Moved token, wallet and timestamp');
  const outOfOrder = trade({ block_number: 0, log_index: 3 });
  await insert(outOfOrder);
  await equivalence('Out-of-order insert');
  await db`DELETE FROM indexer_v2.camp_trades WHERE event_id = ${first.event_id}`;
  await equivalence('Delete current close with an older trade remaining');
  await db`DELETE FROM indexer_v2.camp_trades WHERE token_address = ${tokenB}`;
  await equivalence('Remove last bucket and last membership');
  // Different wallets avoid serializing on the pre-existing Profile aggregates:
  // these transactions contend on the new shared timestamp bucket itself.
  await Promise.all(Array.from({ length: 12 }, (_, i) => insert(trade({ trader_address: addr(100 + i),
    traded_at: new Date((baseTime + 10) * 1000), log_index: i }))));
  await equivalence('Concurrent insertions into one bucket');
  await db.begin(async tx => {
    await tx`UPDATE indexer_v2.camp_trades SET eth_gross = eth_gross + 1`;
    await tx`DELETE FROM indexer_v2.camp_trades WHERE token_address = ${tokenA}`;
    throw new Error('rollback probe');
  }).catch(error => { assert.equal(error.message, 'rollback probe'); });
  await equivalence('Transaction rollback');

  await insert(trade({ token_address: tokenB, traded_at: new Date((baseTime + 0.125) * 1000), eth_gross: '7' }));
  await insert(trade({ token_address: tokenB, traded_at: new Date((baseTime - 172800) * 1000), eth_gross: '11' }));
  await insert(trade({ token_address: tokenB, trader_address: addr(0), eth_gross: '0' }));
  await insert(trade({ chain_id: 4663 }));
  await equivalence('Chain isolation and zero-address exclusion');
  const creator = addr(99);
  const versus = { chain_id: chain, versus_id: '1', factory_address: addr(90), creator_wallet: creator,
    config_id: 0, creator_fee_recipient: creator, token_a_address: tokenA, token_b_address: tokenB,
    created_at: new Date((baseTime - 86400) * 1000), title: 'Snapshot test', description: 'Synthetic data', category: 'Test', socials_json: '{}',
    transaction_hash: hash(900000), block_hash: hash(999), block_number: 0, log_index: 0 };
  await db`INSERT INTO indexer_v2.versuses ${db(versus)}`;
  for (const [side, token] of [tokenA, tokenB].entries()) {
    const camp = { chain_id: chain, versus_id: '1', side, token_address: token, economics_id: 1, quote_asset: addr(0), name: `Camp ${side}`, symbol: `T${side}`, uri: '',
      virtual_eth: '1000000000000000000', graduation_eth: '1000000000000000000', total_supply: '1000000000000000000000000000',
      transaction_hash: hash(900001 + side), block_hash: hash(999), block_number: 0, log_index: side };
    await db`INSERT INTO indexer_v2.versus_camps ${db(camp)}`;
  }
  const snapshot = await load('app/lib/live/debate-snapshot.ts');
  let query, parameters;
  const model = await load('app/lib/db/debates.ts', {
    '../../config/deployment': { INDEXER_SCHEMA: 'indexer_v2', WATCHLIST_TABLE: 'public.user_watchlist_v2' },
    react: { cache: fn => fn }, '../badges': {}, '../../config/korum-network': { KORUM_CHAIN_ID: chain },
    '../cache/redis': {}, '../cache/maintained': {}, '../live/debate-cache': {}, './market-delivery': { recoverMarketDeliveries: async () => {} }, '../live/debate-reconcile': {},
    '../live/debate-snapshot': snapshot, './watchlist': {}, '../markets/quote-usd': {}, '../markets/math': {}, '../public-asset-url': {},
    './client': { getDatabase: () => ({ unsafe: (sql, args) => { query = sql; parameters = args; return db.unsafe(sql, args); } }) },
  });
  async function checkReader() {
    const [row] = await model.loadIndexedDebateRowsByIds(['1']);
    assert.ok(row, 'The real application SQL returns the seeded market');
    for (const [side, token] of [['A', tokenA], ['B', tokenB]]) {
      const [count] = await db`SELECT COUNT(DISTINCT trader_address)::int AS value FROM indexer_v2.camp_trades
        WHERE chain_id = ${chain} AND token_address = ${token} AND trader_address <> ${addr(0)}`;
      assert.equal(row[`token${side}TraderCount`], count.value);
    }
    const [versusCount] = await db`SELECT COUNT(DISTINCT trader_address)::int AS value FROM indexer_v2.camp_trades
      WHERE chain_id = ${chain} AND token_address IN (${tokenA}, ${tokenB}) AND trader_address <> ${addr(0)}`;
    assert.equal(row.versusTraderCount, versusCount.value, 'Wallets trading both camps count once per Versus');
    const observations = [0, 300, 3600, 21600, 86400, 864000].map(offset => Date.now() / 1000 + offset);
    observations.push(baseTime + 86400, baseTime + 86400.124, baseTime + 86400.125, baseTime + 86400.126);
    for (const now of observations) {
      const rolled = snapshot.slideDebateRow(row, now);
      for (const [side, token] of [['A', tokenA], ['B', tokenB]]) {
        const [raw] = await db`SELECT COALESCE(SUM(eth_gross),0)::text AS volume, COUNT(*)::int AS count
          FROM indexer_v2.camp_trades WHERE chain_id = ${chain} AND token_address = ${token}
          AND traded_at >= to_timestamp(${now - 86400}) AND traded_at <= to_timestamp(${now})`;
        assert.equal(rolled[`token${side}Volume24h`], raw.volume);
        assert.equal(rolled[`token${side}Trades24h`], raw.count);
        const slots = await db`SELECT latest.price FROM generate_series(0,95) slot
          LEFT JOIN LATERAL (
            SELECT sqrt_price_x96_after::text AS price FROM indexer_v2.camp_trades
            WHERE chain_id = ${chain} AND token_address = ${token}
              AND traded_at <= to_timestamp(${now}::double precision - slot * 900)
              AND to_timestamp(${now}::double precision - slot * 900) >= ${new Date(row.createdAt)}
            ORDER BY traded_at DESC, block_number DESC, log_index DESC LIMIT 1
          ) latest ON TRUE ORDER BY slot`;
        assert.deepEqual(Array.from(rolled[`token${side}PriceHistory`]), slots.map(item => item.price), '96 real quarter-hour closes match raw SQL');
        for (const [i, seconds] of [300, 3600, 21600, 86400].entries()) {
          const [anchor] = await db`SELECT sqrt_price_x96_after::text AS price FROM indexer_v2.camp_trades
            WHERE chain_id = ${chain} AND token_address = ${token} AND traded_at <= to_timestamp(${now - seconds})
            ORDER BY traded_at DESC, block_number DESC, log_index DESC LIMIT 1`;
          assert.equal(rolled[`token${side}ReferencePrices`][i], anchor?.price ?? null);
        }
      }
    }
    return row;
  }
  await checkReader();
  const bulk = Number(process.env.KORUM_TEST_TRADES || 20000);
  assert.ok(Number.isInteger(bulk) && bulk >= 2000 && bulk <= 100000);
  // Compare sink overhead in rollback-only transactions; the old Profile
  // triggers stay enabled in both cases. Reverse order on a second pass.
  const writeMs = { existing: [], withSnapshots: [] };
  for (const enabled of [false, true, true, false]) {
    await db.begin(async tx => {
      if (!enabled) await tx.unsafe('ALTER TABLE indexer_v2.camp_trades DISABLE TRIGGER camp_trades_snapshot_aggregate_trigger');
      const t0 = performance.now();
      await tx`INSERT INTO indexer_v2.camp_trades
        SELECT (jsonb_populate_record(NULL::indexer_v2.camp_trades, to_jsonb(seed) || jsonb_build_object(
          'event_id', 'overhead-' || n, 'transaction_hash', '0x' || lpad(to_hex(2000000 + n),64,'0'),
          'block_number', 2000000 + n, 'log_index', 0
        ))).* FROM indexer_v2.camp_trades seed CROSS JOIN generate_series(1, 500) n
        WHERE seed.event_id = ${outOfOrder.event_id}`;
      writeMs[enabled ? 'withSnapshots' : 'existing'].push(performance.now() - t0);
      throw new Error('overhead rollback');
    }).catch(error => { assert.equal(error.message, 'overhead rollback'); });
  }
  await equivalence('Write benchmark rollback');
  const started = performance.now();
  await db`INSERT INTO indexer_v2.camp_trades
    SELECT (jsonb_populate_record(NULL::indexer_v2.camp_trades, to_jsonb(seed) || jsonb_build_object(
      'event_id', 'bulk-' || n, 'transaction_hash', '0x' || lpad(to_hex(1000000 + n),64,'0'),
      'block_number', 1000000 + n, 'log_index', 0,
      'traded_at', to_timestamp(${baseTime} + (n % 100)), 'eth_gross', '999999999999999999999999999999'
    ))).* FROM indexer_v2.camp_trades seed CROSS JOIN generate_series(1, ${bulk}) n
    WHERE seed.event_id = ${outOfOrder.event_id}`;
  const insertMs = performance.now() - started;
  await equivalence('High-volume insert');
  await db`UPDATE indexer_v2.camp_trades SET traded_at = traded_at + INTERVAL '0.125 second', eth_gross = eth_gross + 13
    WHERE block_number BETWEEN 1000010 AND 1000020`;
  await db`DELETE FROM indexer_v2.camp_trades WHERE block_number BETWEEN 1000030 AND 1000040`;
  await equivalence('Multi-row corrections and deletes');
  await db`ANALYZE indexer_v2.camp_trades`;
  await db`ANALYZE indexer_v2.camp_trader_memberships`;
  await db`ANALYZE indexer_v2.camp_trade_buckets`;
  const row = await checkReader();
  const [plan] = await db.unsafe(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`, parameters);
  const oldWindow = await db`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT COUNT(DISTINCT trader_address),
    JSONB_AGG(JSONB_BUILD_OBJECT('time', EXTRACT(EPOCH FROM traded_at)::double precision,
      'sqrtPrice', sqrt_price_x96_after::text, 'volume', eth_gross::text) ORDER BY traded_at, block_number, log_index)
    FROM indexer_v2.camp_trades WHERE chain_id = ${chain} AND token_address = ${tokenA}
      AND traded_at >= NOW() - INTERVAL '24 hours'`;
  const [rawPayload] = await db`SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
    'time', EXTRACT(EPOCH FROM traded_at)::double precision, 'sqrtPrice', sqrt_price_x96_after::text, 'volume', eth_gross::text)
    ORDER BY traded_at, block_number, log_index) AS trades
    FROM indexer_v2.camp_trades WHERE chain_id = ${chain} AND token_address = ${tokenA} AND traded_at >= NOW() - INTERVAL '24 hours'`;
  const proof = { bulkTrades: bulk, insertMs, writeBatchSize: 500, writeMs, tokenABuckets: row.tokenAWindowBuckets.length, sparklineSlots: snapshot.slideDebateRow(row, Date.now() / 1000).tokenAPriceHistory.length,
    rawWindowBytes: Buffer.byteLength(JSON.stringify(rawPayload.trades)), bucketBytes: Buffer.byteLength(JSON.stringify(row.tokenAWindowBuckets)),
    fullSnapshotPlan: plan['QUERY PLAN'], oldSingleTokenWindowPlan: oldWindow[0]['QUERY PLAN'] };
  assert.ok(proof.bucketBytes < proof.rawWindowBytes / 10, 'Snapshot growth is tied to timestamps, not repeated trades');
  if (process.env.KORUM_TEST_PROOF) await writeFile(process.env.KORUM_TEST_PROOF, JSON.stringify(proof, null, 2));
  console.log(JSON.stringify({ ...proof, fullSnapshotPlan: undefined, oldSingleTokenWindowPlan: undefined,
    fullSnapshotMs: proof.fullSnapshotPlan[0]['Execution Time'], oldSingleTokenWindowMs: proof.oldSingleTokenWindowPlan[0]['Execution Time'] }, null, 2));
  succeeded = true;
  console.log('PostgreSQL snapshot checks passed: transactional backfill, replay, out-of-order events, corrections, deletes, concurrency, rollback, exact rolling windows and fixed-time 24h sparklines.');
} finally {
  await db.end({ timeout: 5 });
  if (succeeded && process.env.KORUM_TEST_KEEP_DATABASE === '1') console.log(`Kept synthetic database: ${name}`);
  else await admin.unsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin.end({ timeout: 5 });
}
