// Exercise the real stats route, query options and shared SSE scheduler without SQL.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { QueryClient, QueryObserver } from '@tanstack/react-query';

async function load(path, dependencies, globals = {}) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  } }).outputText;
  const exports = {};
  runInNewContext(code, { exports, console, URLSearchParams, setTimeout, clearTimeout, ...globals,
    require: name => {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name} in ${path}`);
      return dependencies[name];
    },
  });
  return exports;
}
const wallet = `0x${'a'.repeat(40)}`;
const otherWallet = `0x${'b'.repeat(40)}`;
let session = null;
let pricePnl = 1;
let reads = 0;
let fail = false;
const route = await load('app/api/profile/stats/route.ts', {
  'next/server': { NextResponse: Response },
  '../../../lib/auth/session': { getWalletSession: async () => session },
  '../../../lib/db/profile-stats': { getUserProfileStats: async address => {
    assert.equal(address, wallet);
    reads++;
    if (fail) throw new Error('Temporary failure');
    return { estimatedPnlEth: pricePnl };
  } },
}, { console: { error() {} } });
assert.equal((await route.GET()).status, 401);
assert.equal(reads, 0, 'Unauthenticated requests cannot read statistics');
session = { address: wallet };
const response = await route.GET();
assert.equal(response.headers.get('cache-control'), 'private, no-store');
assert.equal((await response.json()).stats.estimatedPnlEth, 1);
fail = true;
assert.equal((await route.GET()).status, 503);
fail = false;
reads = 0;

const keys = {
  INDEXED_DEBATES_QUERY_KEY: ['indexed-debates', 'test'], INDEXED_DEBATE_QUERY_KEY: 'indexed-debate:test',
  TOKEN_CHART_QUERY_KEY: 'token-chart:test', TOKEN_TRADES_QUERY_KEY: 'token-trades:test',
  RECENT_MARKET_TRADES_QUERY_KEY: 'recent-market-trades:test', PROFILE_STATS_QUERY_KEY: 'profile-stats:test',
};
let live = false;
let interest;
let pause;
let release;
const statsHook = await load('app/hooks/useProfileStats.ts', {
  '@tanstack/react-query': { useQuery: options => options },
  './useIndexedMarkets': keys,
  './useMarketLive': { useMarketConnection: () => live, useMarketSubscription: value => { interest = value; } },
}, { fetch: async (_url, options) => {
  assert.equal(options.cache, 'no-store');
  assert.equal(options.credentials, 'same-origin');
  assert.ok(options.signal);
  const result = await route.GET();
  if (pause) { const wait = pause; pause = null; await wait; }
  return result;
} });
let options = statsHook.useProfileStats(wallet.toUpperCase(), { estimatedPnlEth: 0 });
assert.equal(interest, `profile:${wallet}:`);
assert.equal(options.queryKey[1], wallet);
assert.equal(options.refetchInterval, 60_000, 'Disconnected recovery is bounded and not 20-second SQL polling');
assert.equal(options.refetchIntervalInBackground, false);
assert.equal(options.refetchOnWindowFocus, 'always');
assert.equal(options.gcTime, 0, 'Private client data is discarded when no longer observed');
live = true;
assert.equal(statsHook.useProfileStats(wallet, null).refetchInterval, false);
assert.equal(statsHook.useProfileStats(null, null).enabled, false);
assert.equal(interest, null);
await assert.rejects(statsHook.useProfileStats(otherWallet, null).queryFn({ signal: new AbortController().signal }), /wallet changed/);
reads = 0;

// Deterministic browser timers; TanStack Query itself is the installed implementation.
let now = 0;
let timerId = 0;
const timers = new Map();
const tick = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };
const advance = async ms => {
  const end = now + ms;
  await tick();
  for (;;) {
    const next = [...timers].filter(([, value]) => value.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
    if (!next) break;
    now = next[1].at; timers.delete(next[0]); next[1].fn(); await tick();
  }
  now = end; await tick();
};
const connections = [];
class FakeEventSource {
  handlers = new Map();
  constructor(url) { this.url = url; connections.push(this); }
  addEventListener(type, fn) { this.handlers.set(type, fn); }
  emit(type, payload = {}) { this.handlers.get(type)?.({ data: JSON.stringify(payload) }); }
  close() { this.closed = true; }
}
const documentListeners = new Map();
const document = {
  visibilityState: 'visible',
  addEventListener: (type, fn) => documentListeners.set(type, fn),
  removeEventListener: type => documentListeners.delete(type),
};
const client = new QueryClient();
const effects = [];
const market = await load('app/hooks/useMarketLive.ts', {
  react: { useEffect: fn => effects.push(fn), useSyncExternalStore: (_subscribe, snapshot) => snapshot() },
  '@tanstack/react-query': { useQueryClient: () => client },
  './useIndexedMarkets': keys,
  '../lib/live/chart': { mergeChartTrades: page => page, replaceChartHead: (data, page) => ({ ...data, pages: [page] }) },
}, { document, EventSource: FakeEventSource,
  setTimeout: (fn, ms) => { timers.set(++timerId, { fn, at: now + ms }); return timerId; },
  clearTimeout: id => timers.delete(id),
});
options = statsHook.useProfileStats(wallet, { estimatedPnlEth: 0 });
const observer = new QueryObserver(client, options);
const stop = observer.subscribe(() => {});
await tick();
assert.equal(observer.getCurrentResult().data.estimatedPnlEth, 1, 'Initial mount reconciles server-rendered data');
market.useMarketLive('feed');
const cleanup = effects.pop()();
await advance(50);
assert.equal(connections.length, 1);
const stream = connections[0];
stream.emit('ready');
await advance(5_000);
reads = 0;
pricePnl = 2;
const trade = { revision: 'new', tokens: [`0x${'c'.repeat(40)}`], reset: false, profileChanged: true, profileWallet: wallet };
stream.emit('market', { ...trade, profileChanged: false });
await advance(5_000);
assert.equal(reads, 0, 'Unrelated market notices do not reload Profile');
stream.emit('market', { ...trade, profileWallet: otherWallet });
await advance(5_000);
assert.equal(reads, 0, 'Delayed notices for a previous wallet cannot refresh the new wallet');
for (let i = 0; i < 30; i++) stream.emit('market', trade);
await advance(4_999);
assert.equal(reads, 0);
await advance(1);
assert.equal(reads, 1, 'A burst of trade notices makes one stats request');
assert.equal(observer.getCurrentResult().data.estimatedPnlEth, 2, 'The displayed query receives the new PNL');

pause = new Promise(resolve => { release = resolve; });
pricePnl = 3;
stream.emit('market', trade);
await advance(5_000);
assert.equal(reads, 2);
pricePnl = 4;
stream.emit('market', trade);
await advance(5_000);
assert.equal(reads, 2, 'Live refresh requests never overlap or repeatedly cancel each other');
release(); await tick();
await advance(5_000);
assert.equal(reads, 3, 'A trade during a request schedules a follow-up read');
assert.equal(observer.getCurrentResult().data.estimatedPnlEth, 4);

stream.emit('market', trade);
await tick();
const beforeHide = reads;
document.visibilityState = 'hidden';
documentListeners.get('visibilitychange')();
await advance(5_000);
assert.ok(stream.closed);
assert.equal(reads, beforeHide, 'A queued refresh does not fetch while the tab is hidden');
pricePnl = 5;
document.visibilityState = 'visible';
documentListeners.get('visibilitychange')();
await advance(50);
connections.at(-1).emit('ready');
await advance(5_000);
assert.equal(observer.getCurrentResult().data.estimatedPnlEth, 5, 'Returning to the tab reconciles trades missed while hidden');
connections.at(-1).emit('market', trade);
await tick();
const beforeUnmount = reads;
cleanup(); stop(); client.clear();
await advance(5_000);
assert.equal(reads, beforeUnmount, 'Unmount removes scheduled private refreshes');
assert.equal(connections.length, 2, 'Profile reuses one shared SSE connection');
console.log('Profile live PNL checks passed: authenticated stats-only route, coalesced trades, in-flight recovery, reconnect and wallet isolation.');

// A busy stream keeps charts incremental while lists and detail HTTP reads are bounded.
const busyToken = `0x${'c'.repeat(40)}`;
const unrelatedToken = `0x${'d'.repeat(40)}`;
const counts = { list: 0, detail: 0, unrelated: 0, chart: 0, trades: 0 };
const stops = [];
let listGate, releaseList;
function observe(name, queryKey, data) {
  const observer = new QueryObserver(client, { queryKey, initialData: data, staleTime: Infinity,
    queryFn: async () => { counts[name]++; if (name === 'list' && listGate) await listGate; return data; } });
  stops.push(observer.subscribe(() => {}));
}
observe('list', keys.INDEXED_DEBATES_QUERY_KEY, []);
observe('detail', [keys.INDEXED_DEBATE_QUERY_KEY, '1'], { tokenA: { address: busyToken }, tokenB: { address: wallet } });
observe('unrelated', [keys.INDEXED_DEBATE_QUERY_KEY, '2'], { tokenA: { address: unrelatedToken } });
observe('chart', [keys.TOKEN_CHART_QUERY_KEY, busyToken], { pages: [{ lastTradeCursor: { block: 1, log: 0 } }] });
observe('trades', [keys.TOKEN_TRADES_QUERY_KEY, busyToken], []);
market.useMarketLive('feed');
const cleanupBusy = effects.pop()();
await advance(50);
const busyStream = connections.at(-1);
busyStream.emit('ready'); await advance(1_000);
Object.keys(counts).forEach(key => { counts[key] = 0; });
for (let i = 0; i < 40; i++) {
  busyStream.emit('market', { tokens: [busyToken], reset: false, trades: [{ token: busyToken }] });
  await advance(25);
}
assert.equal(counts.list, 1, '40 notices/second produce one list reload');
assert.equal(counts.detail, 1); assert.equal(counts.unrelated, 0, 'Unrelated detail queries stay cached');
assert.equal(counts.chart, 0, 'Incremental charts do not wait for list HTTP refreshes');
assert.equal(counts.trades, 4, 'Token history retains its faster cadence');
listGate = new Promise(resolve => { releaseList = resolve; });
busyStream.emit('market', { tokens: [busyToken], reset: false, trades: [] });
await advance(1_000); assert.equal(counts.list, 2);
for (let i = 0; i < 10; i++) busyStream.emit('market', { tokens: [busyToken], reset: false, trades: [] });
await advance(2_000); assert.equal(counts.list, 2, 'Slow list requests are not restarted by later trades');
releaseList(); listGate = null; await tick(); await advance(1_000);
assert.equal(counts.list, 3, 'A trade during the request causes a follow-up after it finishes');
cleanupBusy(); stops.forEach(stop => stop()); client.clear(); await advance(5_000);
console.log('Live cadence passed: 40 notices/second, one list reload, targeted details, direct chart updates and pending-request recovery.');
