// Real TanStack observers, route handlers and cache logic; no external services.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
const require = createRequire(import.meta.url);
async function load(path, deps = {}, globals = {}, append = '') {
  const code = ts.transpileModule(await readFile(new URL('../' + path, import.meta.url), 'utf8'), { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const exports = {};
  runInNewContext(code + append, { exports, Date, Map, Set, Promise, URL, Buffer, JSON, console, process: { env: {} }, ...globals, require: key => {
    if (key === 'server-only') return {};
    if (key in deps) return deps[key];
    if (key.startsWith('node:') || key === 'viem' || key === 'react/jsx-runtime') return require(key);
    throw Error(`Unexpected dependency ${key} in ${path}`);
  } });
  return exports;
}
const flush = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };
const wallet = '0x' + 'a'.repeat(40), other = '0x' + 'b'.repeat(40);
let session = null, reads = 0;
const holdingsRoute = await load('app/api/profile/holdings/route.ts', {
  'next/server': { NextResponse: Response }, '../../../lib/auth/session': { getWalletSession: async () => session },
  '../../../lib/db/profile-holdings': { getProfileHoldings: async () => { reads++; return { ethAmount: '1', tokens: [] }; } },
});
const request = () => new Request('https://korum.test/api/profile/holdings', { headers: { 'X-Wallet-Address': wallet } });
assert.equal((await holdingsRoute.GET(request())).status, 401);
session = { address: other };
assert.equal((await holdingsRoute.GET(request())).status, 409);
assert.equal(reads, 0);
session = { address: wallet };
const holdingsHook = await load('app/hooks/useProfileHoldings.ts', {
  '@tanstack/react-query': { useQuery: options => options }, '../config/deployment': { DEPLOYMENT_CACHE_SCOPE: 'testnet' },
}, { fetch: async () => holdingsRoute.GET(request()) });
const client = new QueryClient();
const observer = new QueryObserver(client, holdingsHook.useProfileHoldings(wallet, false));
const stop = observer.subscribe(() => {});
await flush();
assert.equal(reads, 1);
for (const tab of ['activity', 'badges', 'holdings', 'referrals', 'information']) {
  observer.setOptions(holdingsHook.useProfileHoldings(wallet, tab === 'holdings'));
  await flush();
}
assert.equal(reads, 1, 'Switching Profile tabs does not reload holdings');
assert.equal(holdingsHook.useProfileHoldings(wallet, false).refetchInterval, false);
assert.equal(holdingsHook.useProfileHoldings(wallet, true).refetchInterval, 120000);
assert.equal(holdingsHook.useProfileHoldings(null, true).enabled, false);
session = { address: other };
await assert.rejects(holdingsHook.useProfileHoldings(wallet, false).queryFn({ signal: new AbortController().signal }), /409/);
stop(); client.clear();

// Drive pagination state and the parent's React key through actual component code.
let states = [], cursor = 0;
const fakeReact = { ...React, default: React, useMemo: f => f(), useEffect() {}, useState(initial) {
  const i = cursor++; if (!(i in states)) states[i] = initial;
  return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }];
} };
let pageData;
const list = await load('app/components/explore/VsListClient.tsx', {
  react: fakeReact, './ExploreVsCard': { default: () => null }, './VsTable': { default: () => null },
  '../../hooks/useIndexedMarkets': { useExplorePage: options => ({ data: { items: pageData.slice((Math.min(options.page, Math.max(1, Math.ceil(pageData.length / 12))) - 1) * 12, Math.min(options.page, Math.max(1, Math.ceil(pageData.length / 12))) * 12), page: Math.min(options.page, Math.max(1, Math.ceil(pageData.length / 12))), total: pageData.length, totalPages: Math.max(1, Math.ceil(pageData.length / 12)), catalogTotal: pageData.length } }) },
  '../../hooks/useMinuteClock': { useMinuteClock: () => null },
  '../../lib/explore-page': { EXPLORE_PAGE_SIZE: 12 },
  './ExploreCategoryProvider': { useExploreCategory: () => ({ category: 'All' }) },
}, { window: { matchMedia: () => ({ matches: true }) }, document: { querySelector: () => null } }, '\nexports.Results = PaginatedResults;');
const walk = (node, predicate) => {
  if (!node) return null;
  if (Array.isArray(node)) { for (const child of node) { const found = walk(child, predicate); if (found) return found; } return null; }
  if (!React.isValidElement(node)) return null;
  return predicate(node) ? node : walk(node.props.children, predicate);
};
const debates = Array.from({ length: 36 }, (_, i) => ({ id: i + 1, category: 'Test', tokens: [], createdAt: '2026-10-01' }));
function renderResults(data) { pageData = data; cursor = 0; let result = list.Results({ options: {}, view: 'table', now: null }); cursor = 0; result = list.Results({ options: {}, view: 'table', now: null }); return result; }
let tree = renderResults(debates);
walk(tree, n => n.props['aria-label'] === 'Page 3').props.onClick();
tree = renderResults([...debates].reverse());
assert.equal(walk(tree, n => n.props['aria-current'] === 'page').props['aria-label'], 'Page 3');
tree = renderResults(debates.slice(0, 14));
assert.equal(walk(tree, n => n.props['aria-current'] === 'page').props['aria-label'], 'Page 2');
renderResults(debates.slice(0, 2));
tree = renderResults(debates);
assert.equal(walk(tree, n => n.props['aria-current'] === 'page').props['aria-label'], 'Page 1', 'Clamped page stays clamped if results grow again');
states = []; cursor = 0;
const parent1 = list.default({ indexedDebates: debates, indexedReadFailed: false });
cursor = 0;
const parent2 = list.default({ indexedDebates: [...debates].reverse(), indexedReadFailed: false });
assert.equal(walk(parent1, n => n.type === list.Results).key, walk(parent2, n => n.type === list.Results).key, 'Live reordering keeps pagination mounted');

// Failed revision reads must coalesce SQL without writing an unversioned cache.
let redisFail = true, writes = 0, now = Date.now();
class Clock extends Date { static now() { return now; } }
class FakeRedis {
  status = 'ready'; on() {}
  async get(key) { if (redisFail) throw Error('Redis unavailable'); return key.endsWith('revision') ? 'recovered' : null; }
  async set() { writes++; return 'OK'; }
}
const redis = await load('app/lib/cache/redis.ts', { ioredis: { default: FakeRedis }, '../../config/deployment': { DEPLOYMENT_CACHE_SCOPE: 'testnet' } }, { Date: Clock, process: { env: { REDIS_URL: 'mock' } } });
let loads = 0, release;
const gate = new Promise(resolve => { release = resolve; });
const key = redis.redisCacheKey('market', 'test');
const pending = Array.from({ length: 100 }, () => redis.rememberJson(key, 30, async () => { loads++; await gate; return { price: 7 }; }));
await flush(); assert.equal(loads, 1); release();
assert.equal((await Promise.all(pending)).length, 100); assert.equal(writes, 0);
await assert.rejects(redis.rememberJson(key, 30, async () => { throw Error('SQL unavailable'); }), /SQL unavailable/);
assert.equal((await redis.rememberJson(key, 30, async () => ({ price: 8 }))).price, 8, 'Failed reads release the in-flight entry');
redisFail = false; now += 6000;
await redis.rememberJson(key, 30, async () => ({ price: 9 })); assert.equal(writes, 1, 'Recovered Redis stores only a versioned result');

let budget = false, leaderboardReads = 0;
const leaderboardRoute = await load('app/api/leaderboard/route.ts', {
  'next/server': { NextResponse: Response }, '../../lib/request-identity': { requestIdentity: () => 'test-ip' },
  '../../lib/cache/redis': { redisCacheKey: (...p) => p.join(':'), consumeRateLimit: async () => ({ allowed: budget, retryAfterSeconds: 60 }) },
  '../../lib/db/leaderboard': { LEADERBOARD_CACHE_SECONDS: 300, getTraderLeaderboard: async () => { leaderboardReads++; return { items: [] }; } },
});
const searchRequest = new Request('https://korum.test/api/leaderboard?search=alice'); searchRequest.nextUrl = new URL(searchRequest.url);
assert.equal((await leaderboardRoute.GET(searchRequest)).status, 429); assert.equal(leaderboardReads, 0);
budget = true; assert.equal((await leaderboardRoute.GET(searchRequest)).status, 200);
let sqlReads = 0;
const cached = new Map();
const leaderboard = await load('app/lib/db/leaderboard.ts', {
  '../../config/deployment': { INDEXER_SCHEMA: 'indexer_v2' }, '../../config/korum-network': { KORUM_CHAIN_ID: 46630 },
  '../badges': { calculateBadgeProgress: () => ({ overall: null }) },
  '../cache/redis': { redisCacheKey: (...p) => p.join(':'), rememberJson: async (k, ttl, fn) => {
    assert.equal(ttl, 30); if (!cached.has(k)) cached.set(k, fn()); return cached.get(k);
  } }, '../markets/quote-usd': { getEthUsdQuote: async () => null }, '../markets/pnl': {},
  './client': { getDatabase: () => ({ unsafe: async (query, args) => {
    if (query.includes('SELECT DISTINCT')) return [];
    sqlReads++; assert.match(query, /ROW_NUMBER\(\) OVER/);
    assert.equal(args.length, 2, 'Projection SQL is independent of search, page and sort');
    return [{ pnlRank: 17, volumeRank: 2, traderWallet: wallet, displayName: 'Alice', pnlWei: '0', volumeWei: '0', tradeCount: 1, totalItems: 1, versusCreated: 0, creatorVolumeWei: '0', referralCount: 0, referredVolumeWei: '0' }];
  } }) },
});
const pages = await Promise.all(Array.from({ length: 20 }, () => leaderboard.getTraderLeaderboard({ search: ' Alice ' })));
assert.equal(sqlReads, 1); assert.equal(pages[0].items[0].rank, 17);
await leaderboard.getTraderLeaderboard({ search: 'Alice', sort: 'volume' }); assert.equal(sqlReads, 1, 'Both sorts reuse the projection');
assert.equal((await leaderboard.getTraderLeaderboard({ search: 'lic', sort: 'volume' })).items[0].rank, 2);
assert.equal((await leaderboard.getTraderLeaderboard({ search: 'missing' })).totalItems, 0);
assert.equal((await leaderboard.getTraderLeaderboard({ search: 'Alice', page: 99 })).totalItems, 1);
assert.equal(sqlReads, 1, 'Different searches and out-of-range pages never rerank in SQL');
console.log('Audit follow-up passed: Profile tab requests and wallet isolation, stable/clamped pagination, 100 coalesced SQL fallbacks, Redis recovery, search throttling and cached global ranks.');
