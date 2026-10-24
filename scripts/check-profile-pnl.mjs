// Actual Profile adapters and math; mocked RPC/SQL, optional isolated real Redis.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Redis from 'ioredis';

const require = createRequire(import.meta.url);
async function load(path, dependencies = {}, append = '', env = {}) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const exports = {};
  runInNewContext(code + append, { exports, console, Date, Map, Set, Promise, setTimeout,
    process: { env }, require: name => {
      if (name in dependencies) return dependencies[name];
      if (name === 'server-only') return {};
      if (name.startsWith('node:') || ['viem', 'postgres', 'react', 'react/jsx-runtime'].includes(name)) return require(name);
      throw new Error(`Missing test dependency ${name} in ${path}`);
    } });
  return exports;
}
const math = await load('app/lib/markets/math.ts');
const economics = await load('app/lib/contracts/economics.ts');
const wad = 10n ** 18n;
const q96 = 2n ** 96n;
const wallet = `0x${'a'.repeat(40)}`;
const otherWallet = `0x${'b'.repeat(40)}`;
const config = { tier1Num: 1, tier1Den: 1, tier2Num: 2, tier2Den: 1, fee1Bps: 250, fee2Bps: 150, fee3Bps: 100 };
const curve = {
  versusId: '1', tokenAddress: `0x${'c'.repeat(40)}`, tokenName: 'Curve', tokenSymbol: 'C', configId: '1',
  virtualEth: String(10n * wad), graduationEth: String(10n * wad), realEthAfter: String(2n * wad),
  tokenReserveAfter: String(10n * wad), cumulativeVolumeAfter: '0', curveStatus: 1, poolSqrtPriceX96: null,
  netTokenAmount: String(2n * wad), netCashFlowWei: String(-15n * wad / 10n),
};
const pool = { ...curve, tokenAddress: `0x${'d'.repeat(40)}`, tokenName: 'Pool', tokenSymbol: 'P',
  configId: '99', curveStatus: 3, poolSqrtPriceX96: String(q96),
  virtualEth: null, graduationEth: null, realEthAfter: null, tokenReserveAfter: null, cumulativeVolumeAfter: null,
  netCashFlowWei: String(-16n * wad / 10n) };
let sourceRows = [pool];
let quote = { value: 2000 };
let configsAvailable = true;
const configReads = [];
const modelDependencies = {
  '../contracts/economics': economics, '../markets/math': math,
  '../markets/quote-usd': { getEthUsdQuote: async () => quote },
  '../markets/pnl': { getLaunchConfig: async id => { configReads.push(id); return configsAvailable ? config : null; } },
  './profile-source': { getProfileSource: async () => ({ stats: {}, positions: sourceRows }) },
  './profile-markets': { getProfileMarkets: async () => new Map(sourceRows.map(row => [row.tokenAddress, row])) },
};
const model = await load('app/lib/db/profile-stats.ts', modelDependencies, '\nexports.calculateForCheck = calculateEstimatedPnl;');
const calculate = rows => model.calculateForCheck(rows);
let result = await calculate([curve]);
assert.equal(result.pnlWei, 45n * wad / 100n, 'Curve liquidation keeps protocol fees');
assert.equal(result.usesPoolPrice, false);
configReads.length = 0;
configsAvailable = false;
result = await calculate([pool]);
assert.equal(result.pnlWei, 4n * wad / 10n, 'Pool: 2 ETH inventory less 1.6 ETH purchases');
assert.equal(result.usesPoolPrice, true);
assert.equal(configReads.length, 0, 'Migrated valuation adds no launch-config RPC');
configsAvailable = true;
const losing = { ...pool, versusId: '2', netTokenAmount: String(wad), netCashFlowWei: String(-2n * wad) };
const closed = { ...pool, versusId: '3', netTokenAmount: '0', poolSqrtPriceX96: null, netCashFlowWei: String(wad / 2n) };
result = await calculate([curve, pool, losing, closed]);
assert.equal(result.pnlWei, 35n * wad / 100n);
assert.equal(result.winningVersus, 2, 'The two camps of one Versus are grouped');
assert.equal(result.losingVersus, 1);
for (const price of [null, '', '0', '-1', 'invalid']) assert.equal(await calculate([{ ...pool, poolSqrtPriceX96: price }]), null);
assert.equal(await calculate([curve, { ...pool, poolSqrtPriceX96: null }]), null, 'An unpriced position prevents a misleading partial total');
assert.equal(await calculate([{ ...pool, curveStatus: 2 }]), null, 'Pending migration is still unavailable');
assert.equal(await calculate([{ ...pool, curveStatus: null }]), null);
assert.equal(await calculate([{ ...pool, netTokenAmount: '-1' }]), null);
assert.equal(await calculate([{ ...pool, netCashFlowWei: 'invalid' }]), null);
assert.equal(await calculate([{ ...curve, tokenReserveAfter: String(-2n * wad) }]), null);
assert.equal((await calculate([closed])).pnlWei, wad / 2n, 'Closed migrated positions retain realized cash flows without a price');
assert.equal((await calculate([closed])).usesPoolPrice, false);
assert.equal((await calculate([])).pnlWei, 0n);
assert.ok(await calculate(Array.from({ length: 25 }, () => pool)));
assert.equal(await calculate(Array.from({ length: 26 }, () => pool)), null);
configsAvailable = false;
assert.equal(await calculate([curve, pool]), null);
configsAvailable = true;
let stats = await model.getUserProfileStats(wallet);
assert.equal(stats.estimatedPnlEth, 0.4);
assert.equal(stats.estimatedPnlUsd, 800);
assert.equal(stats.estimatedPnlUsesPoolPrice, true);
quote = null;
assert.equal((await model.getUserProfileStats(wallet)).estimatedPnlUsd, null);
quote = { value: 2000 };

// Holdings and PNL consume the same shared market price; no private pricing SQL.
const holdingsKeys = [];
const holdings = await load('app/lib/db/profile-holdings.ts', {
  ...modelDependencies,
  '../cache/redis': { redisCacheKey: (...parts) => parts.join(':'), rememberJson: async (key, _ttl, loader) => { holdingsKeys.push(key); return loader(); } },
  '../contracts/korum': { VERSUS_TOKEN_ABI: [] },
  '../contracts/server-client': { getKorumServerPublicClient: () => ({ getBalance: async () => 0n, readContract: async () => 2n * wad }) },
});
const held = await holdings.getProfileHoldings(wallet);
assert.equal(held.tokens[0].status, 'pool_estimate');
assert.equal(held.tokens[0].valueEth, 2);
assert.equal(held.totalValueUsd, 4000);
assert.ok(Math.abs(stats.estimatedPnlEth - (held.tokens[0].valueEth - 1.6)) < 1e-12);
assert.ok(holdingsKeys[0].includes('profile-holdings-v3'));

// Render both actual Profile locations so approximate values carry their basis.
const empty = { __esModule: true, default: () => null };
const profile = await load('app/components/ProfileClient.tsx', {
  'next/link': empty, '../config/korum-network': { KORUM_CHAIN: { name: 'Test' } },
  '../hooks/useWatchlist': {}, '../hooks/useProfileStats': {}, '../hooks/useProfileHoldings': {}, '../lib/badges': {},
  '../lib/markets/format': await load('app/lib/markets/format.ts'),
  './ProfileAvatar': empty, './DesignIcon': empty, './AvatarUpload': empty, './ProfileFeeClaim': empty,
  './explore/VsTable': {}, './explore/HorizontalRail': empty,
  './WalletProvider': { shortenAddress: address => address.slice(0, 6), useWallet: () => ({}) },
}, '\nexports.ActivityForCheck = ActivityPanel; exports.InformationForCheck = InformationPanel;');
const activity = renderToStaticMarkup(React.createElement(profile.ActivityForCheck, { stats }));
assert.match(activity, /Pool tokens valued at current price, excluding selling fees and price impact/);
assert.match(activity, /Gas and external ERC-20 transfers are excluded/);
const info = renderToStaticMarkup(React.createElement(profile.InformationForCheck, {
  profile: { evmWallet: wallet, referralCode: 'ABC123', bio: null, avatar: null }, stats,
  referral: { referrer: null, unavailable: false }, holdings: held, holdingsLoading: false,
  onOpenHoldings: () => {}, onProfileChange: () => {},
}));
assert.match(info, /Pool tokens valued at current price, excluding selling fees and price impact/);
const unavailable = renderToStaticMarkup(React.createElement(profile.ActivityForCheck, { stats: { ...stats, estimatedPnlEth: null, estimatedPnlUsd: null, estimatedPnlUsesPoolPrice: false } }));
assert.match(unavailable, /valid balances and valuation data/);
assert.doesNotMatch(unavailable, /executable liquidation quote/);

if (process.argv.includes('--live')) {
  const chainId = process.env.NEXT_PUBLIC_KORUM_NETWORK === 'mainnet' ? 4663 : 46630;
  const manifest = JSON.parse(await readFile(new URL(`../contracts/deployments/${chainId}.json`, import.meta.url), 'utf8'));
  const client = await load('app/lib/db/client.ts', {}, '', process.env);
  const database = client.getDatabase();
  const cache = await load('app/lib/live/profile-cache.ts');
  const cacheMock = { connectedRedis: async () => null, redisCacheKey: (...parts) => parts.join(':'), rememberJson: async (_key, _ttl, loader) => loader() };
  const publicDependencies = {
    '../../config/deployment': { INDEXER_SCHEMA: manifest.readModelSchema, WATCHLIST_TABLE: manifest.watchlistTable },
    '../../config/korum-network': { KORUM_CHAIN_ID: chainId, KORUM_CHAIN: { name: 'Configured network' } },
    react: { cache: fn => fn }, '../badges': {}, '../cache/redis': cacheMock, '../cache/maintained': {},
    '../live/debate-cache': {}, './market-delivery': { recoverMarketDeliveries: async () => {} }, '../live/debate-reconcile': {}, '../live/debate-snapshot': {}, './watchlist': {},
    '../markets/math': math, '../markets/quote-usd': {}, '../public-asset-url': {}, './client': client,
  };
  try {
    const [sample] = await database.unsafe(`
      SELECT position.trader_address AS wallet FROM ${manifest.readModelSchema}.trader_positions position
      JOIN ${manifest.readModelSchema}.camp_market_state market USING (chain_id, token_address)
      WHERE position.chain_id = $1 AND position.net_token_amount > 0 AND market.curve_status = 3
      LIMIT 1
    `, [chainId]);
    const sources = await load('app/lib/db/profile-source.ts', {
      ...publicDependencies, '../live/profile-cache': cache, './debates': {},
    }, '', process.env);
    const source = await sources.getProfileSource(sample?.wallet ?? wallet);
    const publicModel = await load('app/lib/db/debates.ts', publicDependencies, '', process.env);
    const marketModel = await load('app/lib/db/profile-markets.ts', { './debates': publicModel });
    const markets = await marketModel.getProfileMarkets(source.positions.slice(0, 100));
    const migrated = source.positions.flatMap(position => {
      const market = markets.get(position.tokenAddress);
      return market?.curveStatus === 3 && BigInt(position.netTokenAmount) > 0 ? [{ ...position, ...market }] : [];
    }).slice(0, 25);
    if (migrated.length) {
      const estimated = await calculate(migrated);
      assert.ok(estimated && estimated.usesPoolPrice, 'Indexed migrated positions produce a disclosed pool PNL estimate');
    }
    const [trade] = await database.unsafe(`
      SELECT event_id, chain_id, token_address, transaction_hash, block_hash
      FROM ${manifest.readModelSchema}.camp_trades WHERE chain_id = $1
      ORDER BY block_number DESC, log_index DESC LIMIT 1
    `, [chainId]);
    if (trade) {
      const liveServer = await load('app/lib/live/server.ts', {
        '../cache/redis': cacheMock, '../../config/deployment': { INDEXER_SCHEMA: manifest.readModelSchema },
        '../db/client': client, '../markets/math': math, '../markets/venue': {},
        './chart-cache': {}, './debate-cache': {}, './explore-cache': { prepareExploreMutation: async () => ({ revisions: [], mutations: [] }) }, '../db/explore': {}, './profile-cache': cache, '../db/market-delivery': { pendingMarketDeliveries: async () => [], acknowledgeMarketDeliveries: async () => {} }, '../db/debates': {},
      }, '\nexports.walletsForCheck = readAffectedProfileWallets;');
      assert.equal((await liveServer.walletsForCheck([trade])).length, 1, 'Trade invalidation targets resolve against the deployed schema');
    }
    console.log(`SELECT-only Profile checks passed: ${source.positions.length} source positions, ${migrated.length} migrated sample positions, shared indexed pricing and trade invalidation targets.`);
  } finally { await database.end({ timeout: 2 }); }
}

if (process.argv.includes('--redis')) {
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:16379', { maxRetriesPerRequest: 1, retryStrategy: () => null });
  redis.on('error', () => {});
  const namespace = `korum-profile-test:${randomUUID()}`;
  const key = (...parts) => [namespace, ...parts].join(':');
  try {
    const cache = await load('app/lib/live/profile-cache.ts');
    const reconcile = await load('app/lib/live/debate-reconcile.ts');
    const chartMath = await load('app/lib/live/chart.ts');
    const chart = await load('app/lib/live/chart-cache.ts', { './chart': chartMath });
    const counters = new Map();
    const parameters = [];
    const sourceDependencies = {
      '../../config/deployment': { INDEXER_SCHEMA: 'indexer_v2' }, '../../config/korum-network': { KORUM_CHAIN_ID: 46630 },
      '../cache/redis': { connectedRedis: async () => redis, redisCacheKey: key },
      '../live/profile-cache': cache, './market-delivery': { recoverMarketDeliveries: async () => {} }, '../live/debate-reconcile': reconcile,
      './debates': { reconcileIndexedMarkets: () => reconcile.reconcileDebateMetadata(redis, key, async () => 'same-metadata') },
      './client': { getDatabase: () => ({ unsafe: async (sql, params) => {
        parameters.push(params); const address = params[1];
        counters.set(address, (counters.get(address) ?? 0) + 1);
        await new Promise(resolve => setTimeout(resolve, 20));
        return sql.includes('AS "netCashFlowWei"') ? [pool] : [{ tradeCount: address === wallet ? 1 : 2 }];
      } }) },
    };
    const replicas = await Promise.all(Array.from({ length: 4 }, async () => load('app/lib/db/profile-source.ts', {
      ...sourceDependencies, '../cache/maintained': await load('app/lib/cache/maintained.ts'),
    }, '', { REDIS_URL: 'configured', KORUM_GOLDSKY_WEBHOOK_SECRET: 'x'.repeat(32) })));
    await reconcile.reconcileDebateMetadata(redis, key, async () => 'same-metadata');
    const read = (address = wallet, replica = 0) => replicas[replica].getProfileSource(address);
    await Promise.all(Array.from({ length: 100 }, (_, index) => read(wallet, index % 4)));
    assert.equal(counters.get(wallet), 2, '100 Profile reads across 4 replicas load aggregates and positions once');
    assert.equal((await read(otherWallet)).stats.tradeCount, 2);
    assert.equal((await read()).stats.tradeCount, 1, 'Separate wallet sources never leak counters');
    const keys = cache.profileSourceKeys(key, cache.profileWalletHash(wallet));
    await redis.expire(keys.value, 575);
    await read();
    assert.equal(counters.get(wallet), 2, 'A snapshot older than 20s does not reload SQL');
    assert.ok(await redis.ttl(keys.value) > 590);
    const event = { event_id: randomUUID(), operation: 'i' };
    const publish = async (notice, targets) => {
      const globalRevision = key('live', 'revision');
      const previous = await redis.get(globalRevision) ?? '0';
      const updates = await cache.prepareProfileInvalidations(redis, key, [notice], async () => [{ eventId: notice.event_id, wallets: targets }]);
      const revision = randomUUID();
      const published = await redis.eval(chart.publishChartScript, 3, globalRevision, key('channel'), key('event', notice.event_id),
        revision, '{}', previous, 1, `${notice.event_id}:${notice.operation}`, JSON.stringify(updates.revisions), '[]', JSON.stringify(updates.mappings));
      return published;
    };
    await publish(event, [otherWallet]);
    await read();
    assert.equal(counters.get(wallet), 2, 'An unrelated trade updates shared prices, not this wallet’s personal SQL');
    await read(otherWallet);
    assert.equal(counters.get(otherWallet), 4);
    // Actual PNL adapter + actual shared-market mapper, with exact Redis prices.
    const marketRow = { versusId: '1' };
    for (const [side, token] of [['A', pool], ['B', curve]]) Object.assign(marketRow, {
      [`token${side}Address`]: token.tokenAddress, [`token${side}Name`]: token.tokenName, [`token${side}Symbol`]: token.tokenSymbol,
      [`token${side}VirtualEth`]: token.virtualEth, [`token${side}GraduationEth`]: token.graduationEth,
      [`token${side}RealEth`]: token.realEthAfter, [`token${side}Reserve`]: token.tokenReserveAfter,
      [`token${side}CumulativeVolume`]: token.cumulativeVolumeAfter, [`token${side}CurveStatus`]: token.curveStatus,
      [`token${side}PoolSqrtPriceX96`]: token.poolSqrtPriceX96,
    });
    const marketKey = key('test-market');
    await redis.set(marketKey, JSON.stringify(marketRow));
    const cachedMarkets = await load('app/lib/db/profile-markets.ts', {
      './debates': { getIndexedDebateRowsForValuation: async () => [JSON.parse(await redis.get(marketKey))] },
    });
    const liveProfile = await load('app/lib/db/profile-stats.ts', {
      ...modelDependencies, './profile-source': replicas[0], './profile-markets': cachedMarkets,
    });
    const beforePriceChange = counters.get(wallet);
    assert.equal((await liveProfile.getUserProfileStats(wallet)).estimatedPnlEth, 0.4);
    marketRow.tokenAPoolSqrtPriceX96 = String(q96 * 2n);
    await redis.set(marketKey, JSON.stringify(marketRow));
    assert.equal((await liveProfile.getUserProfileStats(wallet)).estimatedPnlEth, -1.1);
    assert.equal(counters.get(wallet), beforePriceChange, 'Another trader changes this holder’s PNL using Redis prices, without personal SQL');
    await publish({ event_id: randomUUID(), operation: 'i' }, [wallet]);
    await Promise.all(Array.from({ length: 100 }, (_, index) => read(wallet, index % 4)));
    assert.equal(counters.get(wallet), 4, 'An own/creator/referrer trade triggers only one personal reconstruction');
    await publish({ ...event, operation: 'd' }, []);
    await read(otherWallet);
    assert.equal(counters.get(otherWallet), 6, 'Deletion invalidates the prior actor retained in Redis');
    await read();
    assert.equal(counters.get(wallet), 4);
    await publish({ event_id: randomUUID(), operation: 'd' }, []);
    await read();
    assert.equal(counters.get(wallet), 6, 'An old unmapped correction recovers sources conservatively');
    const maintained = await load('app/lib/cache/maintained.ts');
    const racingWallet = `0x${'f'.repeat(40)}`;
    const racingKeys = cache.profileSourceKeys(key, cache.profileWalletHash(racingWallet));
    async function racedFill(target, expectedReads) {
      await redis.del(racingKeys.value);
      let started; let resume; let loads = 0;
      const ready = new Promise(resolve => { started = resolve; });
      const waiting = new Promise(resolve => { resume = resolve; });
      const pending = maintained.readMaintained(redis, racingKeys, async () => {
        loads++;
        if (loads === 1) { started(); await waiting; }
        return [{ stats: { tradeCount: loads }, positions: [pool] }];
      });
      await ready;
      await publish({ event_id: randomUUID(), operation: 'i' }, [target]);
      resume();
      assert.equal((await pending)[0].stats.tradeCount, expectedReads);
      assert.equal(loads, expectedReads);
    }
    await racedFill(otherWallet, 1);
    await racedFill(racingWallet, 2);
    assert.ok(parameters.every(params => params[0] === 46630 && [wallet, otherWallet].includes(params[1])));
    assert.ok(!keys.value.includes(wallet), 'Wallet cache keys use hashes');
    console.log('Real Redis Profile checks passed: one cold load across 4 replicas, reuse beyond 20s, targeted invalidation, unrelated-wallet reuse and correction recovery.');
  } finally {
    if (redis.status === 'ready') {
      const keys = await redis.keys(`${namespace}:*`);
      if (keys.length) await redis.unlink(...keys);
      await redis.quit();
    } else redis.disconnect();
  }
}
console.log('Profile PNL checks passed: curve fees, migrated pool estimates, mixed/closed positions, missing prices, limits, USD fallback, Holdings consistency and UI disclosure.');
