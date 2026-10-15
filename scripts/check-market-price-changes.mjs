// Checks the actual snapshot mapper without external requests or transactions.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
async function load(path, dependencies = {}, append = '') {
  const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  } }).outputText;
  const exports = {};
  runInNewContext(code + append, { exports, console, Date, Map, Set,
    require: name => {
      if (name in dependencies) return dependencies[name];
      if (name === 'server-only') return {};
      if (name === 'postgres') return { default: require(name) };
      throw new Error(`Missing test dependency ${name}`);
    }, process: { env: process.env } });
  return exports;
}
const math = await load('app/lib/markets/math.ts');
const snapshot = await load('app/lib/live/debate-snapshot.ts');
const wad = 10n ** 18n;
const q96 = 2n ** 96n;
const root = multiple => String(q96 * BigInt(multiple));
const now = Date.now() / 1000;
assert.equal(math.tokenPriceChange(root(1), root(2), String(wad), String(4n * wad)), 300);
assert.equal(math.tokenPriceChange(root(2), root(1), String(wad), String(4n * wad)), -75);
assert.equal(math.tokenPriceChange(root(1), root(1), String(wad), String(4n * wad)), 0);
assert.equal(math.tokenPriceChange(root(1), null, String(wad), String(4n * wad)), 300,
  'A first trade includes its movement from the initial curve price');
assert.equal(math.tokenPriceChange(null, root(1), String(wad), String(4n * wad)), undefined);
assert.equal(math.tokenPriceChange(root(1), null, '0', String(4n * wad)), undefined);
assert.equal(math.tokenPriceChange(root(1), 'invalid', String(wad), String(4n * wad)), undefined);

const row = {
  versusId: '1', chainId: 46630, createdAt: '2026-10-01T00:00:00Z',
  creatorWallet: `0x${'a'.repeat(40)}`, category: 'Test',
  tokenAName: 'A', tokenBName: 'B', tokenASymbol: 'A', tokenBSymbol: 'B',
  tokenAVirtualEth: String(wad), tokenBVirtualEth: String(wad),
};
for (const side of ['A', 'B']) {
  Object.assign(row, {
    [`token${side}TotalSupply`]: String(4n * wad),
    [`token${side}CirculatingSupply`]: String(wad),
    [`token${side}AdjustedFdvSupply`]: String(wad),
    [`token${side}GraduationEth`]: String(wad),
    [`token${side}SqrtPriceX96`]: root(1),
    [`token${side}Volume24h`]: '0',
    [`token${side}PriceHistory`]: [root(1), root(1)],
    [`token${side}ReferencePrices`]: [root(2), root(3), root(1), null],
    [`token${side}PriorPrice`]: null,
    [`token${side}WindowTrades`]: [
      { time: now - 22000, sqrtPrice: root(1), volume: '7' },
      { time: now - 4000, sqrtPrice: root(3), volume: '11' },
      { time: now - 600, sqrtPrice: root(2), volume: '13' },
      { time: now - 60, sqrtPrice: root(1), volume: '17' },
    ],
  });
}
let actualSql;
const dependencies = {
  '../../config/deployment': { INDEXER_SCHEMA: 'indexer_v2', WATCHLIST_TABLE: 'watchlist' },
  react: { cache: fn => fn },
  '../badges': { calculateBadgeProgress: () => ({ creator: null }) },
  '../../config/korum-network': { KORUM_CHAIN: { name: 'Test' }, KORUM_CHAIN_ID: 46630 },
  '../cache/redis': { redisCacheKey: (...parts) => parts.join(':'), rememberJson: (_key, _ttl, fn) => fn(), connectedRedis: async () => null },
  '../cache/maintained': {},
  '../live/debate-cache': {},
  '../live/debate-reconcile': {},
  '../live/debate-snapshot': snapshot,
  './watchlist': { getUserWatchlist: async () => [1] },
  '../markets/quote-usd': { getEthUsdQuote: async () => null },
  '../markets/math': math,
  './client': { getDatabase: () => ({ unsafe: async sql => { actualSql = sql; return [row]; } }) },
  '../public-asset-url': { publicAssetUrl: () => undefined },
};
const model = await load('app/lib/db/debates.ts', dependencies,
  '\nexports.mapForCheck = toDebate; exports.readForCheck = readIndexedDebates;');
for (const quote of [null, 2500]) {
  const debate = model.mapForCheck(row, quote);
  for (const token of [debate.tokenA, debate.tokenB]) {
    assert.equal(token.change5m, 300);
    assert.equal(token.change1h, 800);
    assert.equal(token.change6h, 0);
    assert.equal(token.change24h, 300, 'The 24h return does not use the clipped sparkline');
  }
}
// Once the price-changing trade falls outside 5m, only the short return becomes flat.
const agedRow = { ...row, tokenAReferencePrices: [root(1), root(2), root(2), root(2)] };
const aged = model.mapForCheck(agedRow, null).tokenA;
assert.equal(aged.change5m, 0);
assert.equal(aged.change1h, 300);
assert.equal(aged.change6h, 300);
assert.equal(aged.change24h, 300);
const quiet = snapshot.slideDebateRow(row, now + 600);
assert.equal(model.mapForCheck(quiet, null).tokenA.change5m, 0, '5m rolls forward without a SQL read');
assert.equal(quiet.tokenAVolume24h, '48');
const nextDay = snapshot.slideDebateRow(row, now + 86401);
assert.equal(nextDay.tokenAVolume24h, '0');
assert.equal(nextDay.tokenATrades24h, 0);
assert.equal(model.mapForCheck(nextDay, null).tokenA.change24h, 0, '24h rolls forward on a quiet market');
assert.deepEqual(Array.from(nextDay.tokenAPriceHistory), []);
await model.readForCheck();
for (const side of ['a', 'b']) {
  assert.ok(actualSql.includes(`history.token_address = camp_${side}.token_address`));
}
assert.ok(actualSql.includes("history.traded_at <= NOW() - INTERVAL '24 hours'"));
assert.ok(actualSql.includes('ORDER BY history.traded_at DESC, history.block_number DESC, history.log_index DESC'));
assert.ok(actualSql.includes('AS window_trades'), 'One timeline provides all four rolling windows');
const watched = await model.getIndexedWatchlistDebates('00000000-0000-0000-0000-000000000001');
assert.equal(watched[0].tokenA.change5m, 300);
assert.equal(watched[0].tokenB.change1h, 800);
assert.ok(actualSql.includes('INNER JOIN watchlist watchlist'), 'Watchlist uses the same corrected snapshot mapper');

if (process.argv.includes('--live')) {
  const client = await load('app/lib/db/client.ts');
  const network = process.env.NEXT_PUBLIC_KORUM_NETWORK === 'mainnet' ? 4663 : 46630;
  const manifest = JSON.parse(await readFile(new URL(`../contracts/deployments/${network}.json`, import.meta.url), 'utf8'));
  const liveModel = await load('app/lib/db/debates.ts', {
    ...dependencies,
    '../../config/deployment': { INDEXER_SCHEMA: manifest.readModelSchema, WATCHLIST_TABLE: manifest.watchlistTable },
    '../../config/korum-network': { KORUM_CHAIN: { name: 'Configured network' }, KORUM_CHAIN_ID: network },
    './client': client,
  }, '\nexports.readForCheck = readIndexedDebates;');
  const database = client.getDatabase();
  try {
    const debates = await liveModel.readForCheck({ limit: 8 });
    const fingerprint = await liveModel.indexedDebateMetadataFingerprint();
    assert.match(fingerprint, /^[a-f0-9]{32}$/, 'The shared metadata probe runs against the deployed schema');
    const recent = await database.unsafe(`
      SELECT camp.symbol, MAX(trade.traded_at) AS "lastTradeAt",
        ROUND(EXTRACT(EPOCH FROM (NOW() - MAX(trade.traded_at))) / 60, 1)::TEXT AS "minutesSinceTrade"
      FROM ${manifest.readModelSchema}.versus_camps camp
      JOIN ${manifest.readModelSchema}.camp_trades trade
        ON trade.chain_id = camp.chain_id AND trade.token_address = camp.token_address
      WHERE camp.chain_id = $1
      GROUP BY camp.token_address, camp.symbol
      ORDER BY MAX(trade.traded_at) DESC
      LIMIT 8
    `, [network]);
    console.log(JSON.stringify({ recentTrades: recent }, null, 2));
    console.log(JSON.stringify(debates.map(debate => ({ id: debate.id, tokens: [debate.tokenA, debate.tokenB].map(token => ({
      symbol: token.symbol, change5m: token.change5m ?? null, change1h: token.change1h ?? null,
      change6h: token.change6h ?? null, change24h: token.change24h ?? null,
    })) })), null, 2));
  } finally { await database.end({ timeout: 2 }); }
}
console.log('Market price change checks passed: window baselines, first trade, idle periods, drops, missing prices, USD invariance and shared snapshot fields.');
