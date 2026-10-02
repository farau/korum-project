// Isolated checks of the actual adapters/components; no writes to the indexer,
// blockchain transactions or external API requests.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as viem from 'viem';

const require = createRequire(import.meta.url);
async function load(path, dependencies = {}, globals = {}, append = '') {
  const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const exports = {};
  runInNewContext(code + append, {
    exports, require: name => {
      if (name in dependencies) return dependencies[name];
      if (name === 'server-only') return {};
      if (name.startsWith('node:') || name === 'react' || name === 'react/jsx-runtime' || name === 'viem') return require(name);
      throw new Error(`Missing test dependency ${name} in ${path}`);
    }, console, process: { env: {} }, AbortSignal, Map, Set, Date, ...globals,
  });
  return exports;
}
const token = `0x${'a'.repeat(40)}`;
const poolId = `0x${'b'.repeat(64)}`;
const venueModel = await load('app/lib/markets/venue.ts');
const venue = { tokenAddress: token, chainId: 4663, curveStatus: 3, poolId };
const pair = { chainId: 'robinhood', dexId: 'uniswap', labels: ['v4'], pairAddress: poolId,
  baseToken: { address: token }, quoteToken: { address: viem.zeroAddress }, url: 'https://untrusted.invalid' };
const valid = venueModel.verifiedDexscreenerChart({ pairs: [pair] }, venue);
assert.equal(valid.status, 'ready');
assert.equal(new URL(valid.embedUrl).hostname, 'dexscreener.com');
assert.equal(new URL(valid.url).pathname, `/robinhood/${poolId}`);
for (const change of [
  { chainId: 'ethereum' }, { dexId: 'other' }, { labels: ['v3'] },
  { pairAddress: `0x${'c'.repeat(64)}` }, { baseToken: { address: viem.zeroAddress } },
  { quoteToken: { address: token } },
]) assert.equal(venueModel.verifiedDexscreenerChart({ pairs: [{ ...pair, ...change }] }, venue), null);
for (const data of [null, {}, { pairs: null }, { pairs: [] }, { pairs: ['bad', null] }]) {
  assert.equal(venueModel.verifiedDexscreenerChart(data, venue), null);
}
assert.equal(venueModel.verifiedDexscreenerChart({ pairs: [pair] }, { ...venue, chainId: 46630 }), null);

const cache = { redisCacheKey: (...parts) => parts.join(':'),
  connectedRedis: async () => null, consumeRateLimit: async () => ({ allowed: true }),
  readJson: async () => ({ hit: false }), writeJson: async () => {}, rememberJson: async (_key, _ttl, load) => load() };
let apiRequests = 0;
let apiData = { pairs: [pair] };
let apiFailure = false;
const dex = await load('app/lib/markets/dexscreener.ts', {
  '../cache/redis': cache, './venue': venueModel,
}, { fetch: async () => {
  apiRequests++;
  if (apiFailure) throw new Error('API offline');
  return { ok: true, json: async () => apiData };
} });
assert.equal((await dex.getDexscreenerChart({ ...venue, chainId: 46630 })).status, 'unsupported');
assert.equal(apiRequests, 0, 'Testnet must not call the mainnet API');
const shared = await Promise.all(Array.from({ length: 20 }, () => dex.getDexscreenerChart(venue)));
assert.ok(shared.every(chart => chart.status === 'ready'));
assert.equal(apiRequests, 1, 'Users share discovery even without Redis');
await dex.getDexscreenerChart(venue);
assert.equal(apiRequests, 1);
apiData = { pairs: null };
const missing = { ...venue, poolId: `0x${'c'.repeat(64)}` };
assert.equal((await dex.getDexscreenerChart(missing)).status, 'pending');
await dex.getDexscreenerChart(missing);
assert.equal(apiRequests, 2, 'Missing-pool results are also cached');
apiFailure = true;
assert.equal((await dex.getDexscreenerChart({ ...venue, poolId: `0x${'d'.repeat(64)}` })).status, 'pending');

let status = 3;
let sqlReads = 0;
let cacheReads = 0;
const sql = [];
const markets = await load('app/lib/db/markets.ts', {
  '../../config/deployment': { INDEXER_SCHEMA: 'indexer_v2' },
  '../../config/korum-network': { KORUM_CHAIN_ID: 4663 },
  '../cache/redis': { ...cache, rememberJson: async (_key, _ttl, load) => { cacheReads++; return load(); } },
  '../markets/quote-usd': { getEthUsdQuote: async () => null },
  '../markets/math': { tokenPriceWad: () => null, unitsNumber: () => null },
  '../live/chart-cache': { readLiveChart: () => { throw new Error('Must not read a graduated chart'); } },
  './client': { getDatabase: () => ({ unsafe: async statement => { sqlReads++; sql.push(statement); return []; } }) },
  './token-venue': { getTokenVenue: async () => ({ ...venue, curveStatus: status }) },
  '../markets/venue': venueModel,
});
for (status of [2, 3]) for (const range of ['1s', '1m', '5m', '15m', '1h', '4h', '1d', '7d', '30d', '180d', 'all']) {
  await assert.rejects(markets.getTokenChart(token, range), error => error instanceof markets.TokenChartUnavailable && error.venue.curveStatus === status);
  if (range !== '1s') await assert.rejects(markets.getTokenChart(token, range, 100, 1000), markets.TokenChartUnavailable);
}
assert.equal(sqlReads, 0, 'Bonded chart requests must never run OHLC/history SQL');
assert.equal(cacheReads, 0, 'Bonded chart requests must never serve old cached candles');
status = 1;
const curveChart = await markets.getTokenChart(token, '1m');
assert.equal(curveChart.intervalSeconds, 60);
assert.equal(sqlReads, 2, 'Bonding curve charts remain available');
assert.ok(sql.every(query => /(?:trade\.|candidate\.)?venue = 0/.test(query)), 'Pool swaps are excluded from every candle query');

let mutations;
let liveRows = [{ eventId: 'pool-trade', blockHash: 'hash', token, block: '5', log: 0,
  timestamp: '1000', previousBlock: null, previousLog: null, sqrtPrice: '1', supply: '1', volume: '1', curveStatus: 3, venue: 1 }];
const live = await load('app/lib/live/server.ts', {
  '../cache/redis': { ...cache, connectedRedis: async () => ({ status: 'ready', get: async () => null, eval: async () => 1 }) },
  '../../config/deployment': { INDEXER_SCHEMA: 'indexer_v2' },
  '../db/client': { getDatabase: () => ({ unsafe: async () => liveRows }) },
  '../markets/math': { tokenPriceWad: value => value, unitsNumber: value => Number(value) },
  '../markets/venue': venueModel,
  './chart-cache': { prepareChartMutations: async (...args) => { mutations = args; return { mutations: [], revisions: [] }; }, publishChartScript: '' },
});
const notice = { event_id: 'pool-trade', chain_id: 4663, token_address: token, block_hash: 'hash', operation: 'i' };
await live.publishMarketNotice([notice]);
assert.equal(mutations[4].length, 0, 'Pool trades must not become candles in Redis/SSE');
assert.equal(mutations[6][0], token, 'Already cached pool charts must be discarded');
liveRows = liveRows.map(row => ({ ...row, curveStatus: 2, venue: 0 }));
await live.publishMarketNotice([notice]);
assert.equal(mutations[4].length, 0, 'Final curve trades must not calculate candles during graduation');
liveRows = liveRows.map(row => ({ ...row, curveStatus: 1 }));
await live.publishMarketNotice([notice]);
assert.equal(mutations[4].length, 1, 'Curve live updates still work');

const styles = { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
let connected = false;
let chainStatus;
let submitTrade;
let statusChecks = 0;
let walletRequests = 0;
const jsxRuntime = require('react/jsx-runtime');
const captureForm = method => (type, props, ...rest) => {
  if (type === 'form') submitTrade = props.onSubmit;
  return jsxRuntime[method](type, props, ...rest);
};
const tradePanel = await load('app/components/TokenTradePanel.tsx', {
  react: { ...React, useState: initial => [React.useState(initial?.loaded === false ? { ...initial, loaded: true } : initial)[0], () => {}] },
  'react/jsx-runtime': { ...jsxRuntime, jsx: captureForm('jsx'), jsxs: captureForm('jsxs') },
  '../lib/markets/venue': venueModel,
  '../hooks/usePendingReferral': { usePendingReferral: () => ({ referral: null, clear: () => {} }) },
  '../lib/referrals/client': { fetchPendingReferral: async () => null },
  '@tanstack/react-query': { useQueryClient: () => ({}) },
  wagmi: {
    useAccount: () => ({ isConnected: connected, address: connected ? token : undefined }),
    useBalance: () => ({}), useChainId: () => 4663, usePublicClient: () => ({}),
    useReadContract: ({ functionName }) => ({
      data: functionName === 'getCurve' && chainStatus !== undefined ? { status: chainStatus, quoteAsset: viem.zeroAddress } : undefined,
      refetch: async () => { statusChecks++; return { data: { status: 2, quoteAsset: viem.zeroAddress } }; },
    }),
    useSwitchChain: () => ({ switchChainAsync: () => { walletRequests++; } }),
    useWriteContract: () => ({ reset: () => {}, writeContractAsync: () => { walletRequests++; } }),
  },
  '../lib/markets/format': { formatTokenAmount: () => '' },
  '../hooks/useIndexedMarkets': {},
  '../lib/contracts/korum': { KORUM_CHAIN: { id: 4663, name: 'Robinhood', blockExplorers: { default: { url: '' } } }, KORUM_CORE_ADDRESS: token },
  './WalletProvider': { useWallet: () => ({ authenticated: connected, connect: () => { walletRequests++; } }) },
  './VsDetailClient.module.css': styles,
});
for (connected of [false, true]) for (chainStatus of [undefined, 1, 2]) for (const mode of ['buy', 'sell']) {
  const markup = renderToStaticMarkup(React.createElement(tradePanel.default, { token: { name: 'Token', symbol: 'TEST', address: token, curveStatus: 2 }, initialMode: mode, onStatus: () => {} }));
  assert.ok(markup.includes(venueModel.GRADUATING_MESSAGE));
  assert.match(markup, /<button[^>]*type="submit"[^>]*disabled=""/);
  assert.match(markup, /<input[^>]*disabled=""/);
  assert.ok(!markup.includes('CONNECT WALLET'), 'Graduation message takes precedence over wallet connection');
}
connected = false;
chainStatus = 1;
const availableMarkup = renderToStaticMarkup(React.createElement(tradePanel.default, {
  token: { name: 'Token', symbol: 'TEST', address: token, curveStatus: 1 }, onStatus: () => {},
}));
assert.match(availableMarkup, /<button[^>]*type="submit"[^>]*>CONNECT WALLET/,
  'The disconnected curve baseline is enabled, so graduation alone disables that same button');
connected = true;
for (const mode of ['buy', 'sell']) {
  renderToStaticMarkup(React.createElement(tradePanel.default, {
    token: { name: 'Token', symbol: 'TEST', address: token, curveStatus: 1 }, initialMode: mode,
    initialAmount: '0.01', onStatus: () => {},
  }));
  await submitTrade({ preventDefault() {} });
}
assert.equal(statusChecks, 2, 'Each buy/sell checks fresh status before proceeding');
assert.equal(walletRequests, 0, 'A token graduating since the quote never opens approval/trading prompts');

let poolData = { ...venue, chart: valid };
const poolComponent = await load('app/components/GraduatedPoolChart.tsx', {
  '@tanstack/react-query': { useQuery: () => ({ data: poolData, isError: false }) },
  '../config/deployment': {}, './VsDetailClient.module.css': styles,
});
let markup = renderToStaticMarkup(React.createElement(poolComponent.default, { tokenAddress: token, symbol: 'TEST' }));
assert.ok(markup.includes('<iframe') && markup.includes('dexscreener.com/robinhood/'));
assert.ok(markup.includes('Open on DEX Screener'));
for (const state of ['pending', 'unsupported']) {
  poolData = { ...venue, chart: { status: state, url: null, embedUrl: null } };
  markup = renderToStaticMarkup(React.createElement(poolComponent.default, { tokenAddress: token, symbol: 'TEST' }));
  assert.ok(!markup.includes('<iframe'));
  assert.ok(markup.includes(state === 'pending' ? 'Waiting for the Uniswap pool chart' : 'Pool chart unavailable on testnet'));
}

let chartOptions;
let observedStatus;
const chartData = { pages: [{ points: [], windowStart: 1, windowEnd: 300, quoteUsd: null, hasMore: false,
  priorPrice: null, priorMarketCap: null, lastTradeTimestamp: null }], pageParams: [undefined] };
const detail = await load('app/components/VsDetailClient.tsx', {
  react: { ...React, useState: initial => React.useState(initial === null && observedStatus !== undefined ? { address: token, status: observedStatus } : initial) },
  '../lib/live/chart': { slideChart: () => {}, replaceChartHead: () => {} },
  '../hooks/useMarketLive': { useMarketLive: () => false, marketNoticeVersion: () => 0 },
  'next/link': { __esModule: true, default: ({ children }) => React.createElement('a', null, children) },
  'next/image': { __esModule: true, default: () => null },
  './BellIcon': {},
  '@tanstack/react-query': {
    useQueryClient: () => ({}), useQuery: () => ({}),
    useInfiniteQuery: options => { chartOptions = options; return { data: chartData }; },
  },
  '../hooks/useWatchlist': {}, './WalletProvider': {},
  '../config/korum-network': {},
  '../hooks/useIndexedMarkets': { TOKEN_CHART_QUERY_KEY: 'chart' },
  '../lib/versus-socials': {},
  '../lib/markets/format': { formatMarketValue: () => '0', formatTokenAmount: () => '0' },
  './MarketCandlestickChart': { __esModule: true, default: () => React.createElement('div', { 'data-korum-candles': true }) },
  './GraduatedPoolChart': { __esModule: true, default: poolComponent.default },
  './TokenTradePanel': { __esModule: true, default: () => null },
  './ProfileAvatar': {}, './CreatorFeeTransfer': {}, './PendingCreatorFeeNotice': {},
  './VsDetailClient.module.css': styles,
  '../lib/markets/venue': venueModel,
}, {}, '\nexports.TokenPanelForCheck = TokenPanel;');
for (const curveStatus of [1, 2, 3]) {
  poolData = { ...venue, chart: valid };
  markup = renderToStaticMarkup(React.createElement(detail.TokenPanelForCheck, {
    token: { name: 'Token', symbol: 'TEST', address: token, curveStatus }, side: 'a', marketAvailable: true,
    marketShare: 50, onMarketUpdate: () => {}, onStatus: () => {},
  }));
  assert.equal(chartOptions.enabled, curveStatus === 1, 'Graduating/graduated panels disable all Korum chart requests');
  assert.equal(markup.includes('data-korum-candles'), curveStatus === 1, 'Even an old cached chart disappears after bonding');
  assert.equal(markup.includes('<iframe'), curveStatus === 3);
  if (curveStatus === 2) assert.ok(markup.includes(venueModel.GRADUATING_MESSAGE));
}
for (observedStatus of [2, 3]) {
  markup = renderToStaticMarkup(React.createElement(detail.TokenPanelForCheck, {
    token: { name: 'Token', symbol: 'TEST', address: token, curveStatus: 1 }, side: 'a', marketAvailable: true,
    marketShare: 50, onMarketUpdate: () => {}, onStatus: () => {},
  }));
  assert.equal(chartOptions.enabled, false, 'Observed venue transitions stop charts even while indexed props are stale');
  assert.ok(!markup.includes('data-korum-candles'));
  assert.equal(markup.includes('<iframe'), observedStatus === 3);
}
console.log('Graduated market checks passed: verified pool identity, shared discovery, missing/API-offline/testnet states, zero bonded OHLC SQL/cache reads, curve charts, pool SSE/Redis exclusion, disabled graduation trading and embed rendering.');
