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
    }, console, process: { env: {} }, AbortSignal, Map, Set, Date, URL, ...globals,
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
assert.equal(venueModel.verifiedDexscreenerChart({ pairs: [pair] }, { ...venue, curveStatus: 2 }), null,
  'An indexed Dexscreener pool never completes contract migration');
assert.equal(venueModel.resolveCurveStatus(3, 2), 2);
assert.equal(venueModel.resolveCurveStatus(2, 3), 3);
assert.equal(venueModel.resolveCurveStatus(2, 1), 2);


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
  './debates': { reconcileIndexedMarkets: async () => {} }, './token-venue': { getTokenVenue: async () => ({ ...venue, curveStatus: status }) },
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
  '../cache/redis': { ...cache, connectedRedis: async () => ({ status: 'ready', get: async () => null, mget: async () => [null], eval: async () => 1 }) },
  '../../config/deployment': { INDEXER_SCHEMA: 'indexer_v2' },
  '../db/client': { getDatabase: () => ({ unsafe: async () => liveRows }) },
  '../markets/math': { tokenPriceWad: value => value, unitsNumber: value => Number(value) },
  '../markets/venue': venueModel,
  './chart-cache': { prepareChartMutations: async (...args) => { mutations = args; return { mutations: [], revisions: [] }; }, publishChartScript: '' },
  './debate-cache': { prepareDebateMutations: async () => ({ mutations: [], revisions: [], mappings: [] }) },
  './explore-cache': { prepareExploreMutation: async () => ({ revisions: [], mutations: [] }) }, '../db/explore': {}, './profile-cache': { prepareProfileInvalidations: async () => ({ revisions: [], mappings: [] }) },
  '../db/market-delivery': { pendingMarketDeliveries: async () => [], acknowledgeMarketDeliveries: async () => {} }, '../db/debates': { loadIndexedDebateRowsByIds: async () => [] },
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
let renderMode = 'buy';
let renderedQuote = null;
let renderedAmount = '0.01';
let renderedEthBalance;
let nullTradeState = 0;
function renderTrade(tokenProps, mode = 'buy', quote = null, amount = '0.01') {
  renderMode = mode;
  renderedQuote = quote;
  renderedAmount = amount;
  nullTradeState = 0;
  return renderToStaticMarkup(React.createElement(tradePanel.default, {
    token: { name: 'Token', symbol: 'TEST', address: token, ...tokenProps }, onStatus: () => {},
  }));
}

const jsxRuntime = require('react/jsx-runtime');
const captureForm = method => (type, props, ...rest) => {
  if (type === 'form') submitTrade = props.onSubmit;
  return jsxRuntime[method](type, props, ...rest);
};
const tradePanel = await load('app/components/TokenTradePanel.tsx', {
  react: { ...React, useState: initial => {
    let value = initial === 'buy' ? renderMode : initial;
    if (initial === '') value = renderedAmount;
    if (initial === null && nullTradeState++ === 0 && renderedQuote) value = renderedQuote;
    if (initial?.loaded === false) value = { ...initial, loaded: true };
    return [React.useState(value)[0], () => {}];
  } },
  'react/jsx-runtime': { ...jsxRuntime, jsx: captureForm('jsx'), jsxs: captureForm('jsxs') },
  '../lib/markets/venue': venueModel,
  '../hooks/usePendingReferral': { usePendingReferral: () => ({ referral: null, clear: () => {} }) },
  '../lib/referrals/client': { fetchPendingReferral: async () => null },
  '@tanstack/react-query': { useQueryClient: () => ({}) },
  wagmi: {
    useAccount: () => ({ isConnected: connected, address: connected ? token : undefined }),
    useBalance: () => ({ data: renderedEthBalance === undefined ? undefined : { value: renderedEthBalance, decimals: 18 } }), useChainId: () => 4663, usePublicClient: () => ({}),
    useReadContract: ({ functionName }) => ({
      data: functionName === 'getCurve' && chainStatus !== undefined ? { status: chainStatus, quoteAsset: viem.zeroAddress }
        : functionName === 'balanceOf' || functionName === 'allowance' ? viem.parseEther('100') : undefined,
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
  './GraduateTokenButton': { __esModule: true, default: () => null },
});
for (connected of [false, true]) for (chainStatus of [undefined, 1, 2]) for (const mode of ['buy', 'sell']) {
  const markup = renderTrade({ curveStatus: 2 }, mode);
  assert.ok(markup.includes(venueModel.GRADUATING_MESSAGE));
  assert.match(markup, /<button[^>]*type="submit"[^>]*disabled=""/);
  assert.match(markup, /<input[^>]*disabled=""/);
  assert.ok(!markup.includes('CONNECT WALLET'), 'Graduation message takes precedence over wallet connection');
}
connected = false;
chainStatus = 1;
const availableMarkup = renderTrade({ curveStatus: 1 });
assert.ok(availableMarkup.includes('CONNECT WALLET'));
assert.doesNotMatch(availableMarkup, /<button[^>]*type="submit"[^>]*disabled=""/,
  'The disconnected curve baseline is enabled, so migration alone disables that same button');
connected = true;
for (const mode of ['buy', 'sell']) {
  renderTrade({ curveStatus: 1 }, mode);
  await submitTrade({ preventDefault() {} });
}
assert.equal(statusChecks, 2, 'Each buy/sell checks fresh status before proceeding');
assert.equal(walletRequests, 0, 'A token graduating since the quote never opens approval/trading prompts');

// Trading resumes on contract status 3 even with a stale migrating snapshot or no Dexscreener pool.
chainStatus = 3;
for (const curveStatus of [2, 3]) for (const pool of [undefined, poolId]) for (const mode of ['buy', 'sell']) {
  const markup = renderTrade({ curveStatus, poolId: pool }, mode, {
    amountIn: viem.parseEther('0.01'), amountOut: viem.parseEther('1'), mode, venueStatus: 3,
  });
  assert.ok(!markup.includes(venueModel.GRADUATING_MESSAGE));
  assert.ok(markup.includes('Pool quote simulated on-chain'));
  assert.doesNotMatch(markup, /<button[^>]*type="submit"[^>]*disabled=""/,
    'A confirmed migrated token with a valid on-chain quote can trade without Dexscreener');
}
chainStatus = 2;
for (const mode of ['buy', 'sell']) {
  const markup = renderTrade({ curveStatus: 3, poolId }, mode);
  assert.match(markup, /<button[^>]*type="submit"[^>]*disabled=""/);
  assert.ok(markup.includes(venueModel.GRADUATING_MESSAGE), 'An indexed pool cannot override contract migration');
}
assert.equal(walletRequests, 0, 'All checks run without wallet transactions');

connected = true;
renderedEthBalance = 0n;
for (chainStatus of [1, 3]) for (const mode of ['buy', 'sell']) for (const amount of ['', '0', '-1', 'invalid']) {
  const markup = renderTrade({ curveStatus: chainStatus }, mode, null, amount);
  assert.match(markup, /ENTER AMOUNT/);
  assert.match(markup, /Enter a positive amount in/);
  assert.doesNotMatch(markup, /INSUFFICIENT/);
  assert.match(markup, /<button[^>]*type="submit"[^>]*disabled=""/);
}
chainStatus = 1;
assert.match(renderTrade({ curveStatus: 1 }, 'buy', null, '0.01'), /INSUFFICIENT ETH/,
  'A positive amount exceeding the wallet balance still reports insufficient funds');
renderedEthBalance = undefined;

let poolData = { ...venue, chart: valid };
let poolTheme = 'dark';
const poolComponent = await load('app/components/GraduatedPoolChart.tsx', {
  react: { ...React, useSyncExternalStore: () => poolTheme },
  '@tanstack/react-query': { useQuery: () => ({ data: poolData, isError: false }) },
  '../config/deployment': {}, './VsDetailClient.module.css': styles,
});
let markup = renderToStaticMarkup(React.createElement(poolComponent.default, { tokenAddress: token, symbol: 'TEST' }));
assert.ok(markup.includes('<iframe') && markup.includes('dexscreener.com/robinhood/'));
assert.ok(markup.includes('Open on DEX Screener'));
for (poolTheme of ['light', 'dark']) {
  markup = renderToStaticMarkup(React.createElement(poolComponent.default, { tokenAddress: token, symbol: 'TEST' }));
  assert.ok(markup.includes(`theme=${poolTheme}`), 'The embedded chart follows the selected theme');
}
for (const state of ['pending', 'unsupported']) {
  poolData = { ...venue, chart: { status: state, url: null, embedUrl: null } };
  markup = renderToStaticMarkup(React.createElement(poolComponent.default, { tokenAddress: token, symbol: 'TEST' }));
  assert.ok(!markup.includes('<iframe'));
  assert.ok(markup.includes(state === 'pending' ? 'Waiting for the DEX Screener chart' : 'Pool chart unavailable on testnet'));
  assert.ok(markup.includes('Trading and market metrics remain available'));

}

let chartOptions;
let observedStatus;
let onChainStatus;
let nullDetailState = 0;
let observedAddress = token;
function renderDetail(tokenProps) {
  nullDetailState = 0;
  return renderToStaticMarkup(React.createElement(detail.TokenPanelForCheck, {
    token: { name: 'Token', symbol: 'TEST', address: token, ...tokenProps }, side: 'a', marketAvailable: true,
    marketShare: 50, onMarketUpdate: () => {}, onStatus: () => {},
  }));
}
const chartData = { pages: [{ points: [], windowStart: 1, windowEnd: 300, quoteUsd: null, hasMore: false,
  priorPrice: null, priorMarketCap: null, lastTradeTimestamp: null }], pageParams: [undefined] };
const detail = await load('app/components/VsDetailClient.tsx', {
  react: { ...React, useState: initial => {
    let value = initial;
    if (initial === null) {
      const status = nullDetailState++ === 0 ? observedStatus : onChainStatus;
      value = status === undefined ? null : { address: observedAddress, status };
    }
    return React.useState(value);
  } },
  '../lib/live/chart': { slideChart: () => {}, replaceChartHead: () => {} },
  '../hooks/useMarketLive': { useMarketLive: () => false, marketNoticeVersion: () => 0 },
  'next/link': { __esModule: true, default: ({ children }) => React.createElement('a', null, children) },
  'next/image': { __esModule: true, default: () => null },
  './BellIcon': {},
  './MarketStatIcon': { __esModule: true, default: () => null },
  '@tanstack/react-query': {
    useQueryClient: () => ({}), useQuery: () => ({}),
    useInfiniteQuery: options => { chartOptions = options; return { data: chartData }; },
  },
  '../hooks/useWatchlist': {}, './WalletProvider': {},
  '../config/korum-network': {},
  '../hooks/useIndexedMarkets': { TOKEN_CHART_QUERY_KEY: 'chart' },
  '../lib/versus-socials': {},
  '../lib/markets/format': { formatMarketValue: value => String(value ?? 0), formatTokenAmount: () => '0' },
  './MarketCandlestickChart': { __esModule: true, default: () => React.createElement('div', { 'data-korum-candles': true }) },
  './GraduatedPoolChart': { __esModule: true, default: poolComponent.default },
  './TokenTradePanel': { __esModule: true, default: () => null },
  './ProfileAvatar': {}, './CreatorFeeTransfer': {}, './PendingCreatorFeeNotice': {},
  './VsDetailClient.module.css': styles,
  '../lib/markets/venue': venueModel,
}, {}, '\nexports.TokenPanelForCheck = TokenPanel;');
for (const curveStatus of [1, 2, 3]) {
  poolData = { ...venue, chart: valid };
  markup = renderDetail({ curveStatus });
  assert.equal(chartOptions.enabled, curveStatus === 1, 'Migrating/graduated panels disable all Korum chart requests');
  assert.equal(markup.includes('data-korum-candles'), curveStatus === 1, 'Even an old cached chart disappears after bonding');
  assert.equal(markup.includes('<iframe'), curveStatus === 3);
  if (curveStatus === 2) assert.ok(markup.includes(venueModel.GRADUATING_MESSAGE));
}
for (observedStatus of [2, 3]) {
  markup = renderDetail({ curveStatus: 1 });
  assert.equal(chartOptions.enabled, false, 'Observed venue transitions stop charts even while indexed props are stale');
  assert.ok(!markup.includes('data-korum-candles'));
  assert.equal(markup.includes('<iframe'), observedStatus === 3);
}
// The contract wins over both stale indexed statuses and cached Dexscreener embeds.
observedStatus = 3;
onChainStatus = 2;
poolData = { ...venue, chart: valid };
markup = renderDetail({ curveStatus: 3, poolId });
assert.ok(markup.includes(venueModel.GRADUATING_MESSAGE));
assert.ok(!markup.includes('<iframe') && !markup.includes('data-korum-candles'));
assert.equal(chartOptions.enabled, false);
observedStatus = 2;
onChainStatus = 3;
poolData = { ...venue, curveStatus: 2, poolId: null, chart: null };
markup = renderDetail({ curveStatus: 2, marketCap: 100, volume24h: 5, traderCount: 2 });
assert.ok(!markup.includes(venueModel.GRADUATING_MESSAGE));
assert.ok(markup.includes('Waiting for the DEX Screener chart'));
assert.ok(markup.includes('Trading and market metrics remain available'));
assert.ok(markup.includes('Market cap<strong>100') && markup.includes('Vol 24h<strong>5'));
assert.equal(chartOptions.enabled, false);
// A status observation for another token cannot change this panel's lifecycle.
observedAddress = `0x${'c'.repeat(40)}`;
markup = renderDetail({ curveStatus: 2 });
assert.ok(markup.includes(venueModel.GRADUATING_MESSAGE));
console.log('Graduated market checks passed: migration locks buy/sell despite Dexscreener availability, contract graduation unlocks trading without a chart, fresh pre-trade status checks, stale indexer isolation, retained metrics and verified chart embeds.');
