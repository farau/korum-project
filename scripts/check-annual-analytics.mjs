import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
let clock = new Date('2026-10-13T12:00:00Z');
class TestDate extends Date {
  constructor(...args) { super(...(args.length ? args : [clock.getTime()])); }
  static now() { return clock.getTime(); }
}
async function load(path, dependencies) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const exports = {};
  runInNewContext(code, { exports, Date: TestDate, Intl, URL, Response, console, require: name => {
    if (name in dependencies) return dependencies[name];
    if (['react', 'react/jsx-runtime'].includes(name)) return require(name);
    throw new Error(`Unmocked dependency ${name}`);
  } });
  return exports;
}
const helpers = await load('app/lib/analytics.ts', {});
const timestamp = date => new Date(date).getTime() / 1000;
const bucket = (date, volumeEth = 1) => ({ timestamp: timestamp(date), volumeEth, volumeUsd: volumeEth * 2000, trades: 2 });
const labels = buckets => Array.from(buckets, value => new Date(value.timestamp * 1000).toISOString().slice(0, 7));
const window = helpers.analyticsWindow('year', clock);
assert.equal(window.startSeconds, timestamp('2026-01-01T00:00:00Z'));
assert.equal(window.endSeconds, clock.getTime() / 1000);
assert.equal(window.bucketSeconds, null);
let buckets = helpers.annualBuckets([
  bucket('2026-09-01'), bucket('2025-12-01'), bucket('2026-02-01'), bucket('2026-11-01'),
], clock, true);
assert.deepEqual(labels(buckets), ['2026-02', '2026-09', '2026-10']);
assert.equal(buckets.at(-1).volumeUsd, 0, 'Empty current month remains a true zero');
assert.equal(buckets.at(-1).trades, 0);
assert.deepEqual(labels(helpers.annualBuckets([], clock, false)), ['2026-10']);
assert.equal(helpers.annualBuckets([], clock, false)[0].volumeUsd, null);
assert.deepEqual(labels(helpers.annualBuckets([bucket('2026-10-01', 4)], clock, true)), ['2026-10']);
assert.equal(helpers.annualBuckets([bucket('2026-10-01', 4)], clock, true)[0].volumeEth, 4);
clock = new Date('2027-01-01T00:00:00Z');
assert.equal(helpers.analyticsWindow('year', clock).startSeconds, timestamp('2027-01-01'));
assert.deepEqual(labels(helpers.annualBuckets([bucket('2026-12-01')], clock, true)), ['2027-01']);
clock = new Date('2028-03-01T00:00:00Z');
assert.deepEqual(labels(helpers.annualBuckets([bucket('2028-02-29T23:59:59Z')], clock, true)), ['2028-02', '2028-03']);
assert.equal(helpers.analyticsWindow('week', clock).endSeconds - helpers.analyticsWindow('week', clock).startSeconds, 7 * 86400);

const calls = [];
const keys = [];
let quote = { value: 2000 };
const db = await load('app/lib/db/analytics.ts', {
  'server-only': {}, '../../config/deployment': { INDEXER_SCHEMA: 'indexer_test' },
  '../analytics': helpers,
  '../cache/redis': { redisCacheKey: (...parts) => parts.join(':'), rememberJson: async (key, _ttl, loader) => { keys.push(key); return loader(); } },
  '../markets/quote-usd': { getEthUsdQuote: async () => quote },
  '../markets/math': { unitsNumber: value => Number(value) / 1e18 },
  '../../config/korum-network': { KORUM_CHAIN_ID: 46630 },
  './client': { getDatabase: () => ({ unsafe: async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('AS "feesEth"')) return [{ isTotal: 1, category: "Other", trades: 4, volumeEth: '3000000000000000000', feesEth: '100000000000000000', creatorFeesEth: '20000000000000000', traders: 2, activeVersus: 1 }];
    return [{ timestamp: timestamp(`${clock.getUTCFullYear()}-02-01`), volumeEth: '3000000000000000000', trades: 4 }];
  } }) },
});
clock = new Date('2027-03-05T12:00:00Z');
let annual = await db.getAnalytics('year');
assert.deepEqual(labels(annual.buckets), ['2027-02', '2027-03']);
assert.equal(annual.volumeUsd, 6000);
assert.equal(annual.feesUsd, 200);
assert.equal(annual.creatorFeesUsd, 40);
assert.equal(annual.traders, 2);
for (const call of calls) {
  assert.deepEqual(Array.from(call.params), [46630, timestamp('2027-01-01'), clock.getTime() / 1000]);
  assert.match(call.sql, /trade\.traded_at < TO_TIMESTAMP\(\$3/);
}
assert.match(calls[1].sql, /DATE_TRUNC\('month', trade\.traded_at AT TIME ZONE 'UTC'\)/);
assert.match(calls[1].sql, /ORDER BY timestamp ASC/);
clock = new Date('2027-04-01T00:00:00Z');
await db.getAnalytics('year');
clock = new Date('2028-01-01T00:00:00Z');
await db.getAnalytics('year');
assert.equal(new Set(keys).size, 3, 'Monthly/yearly rollovers use separate cache entries');
quote = null;
annual = await db.getAnalytics('year');
assert.equal(annual.volumeUsd, null);
assert.equal(annual.buckets[0].volumeUsd, null);
calls.length = 0;
await db.getAnalytics('day');
assert.equal(calls[1].params[3], 3600);
assert.match(calls[1].sql, /FLOOR\(EXTRACT\(EPOCH FROM trade.traded_at\) \/ \$4\) \* \$4/);

const route = await load('app/api/analytics/route.ts', {
  '../../lib/db/analytics': { ANALYTICS_CACHE_SECONDS: 600, getAnalytics: async period => { assert.equal(period, 'year'); return annual; } },
});
const response = await route.GET(new Request('https://korum.test/api/analytics?period=year'));
assert.equal(response.status, 200);
assert.equal(response.headers.get('cache-control'), 'no-store');

let failure = false;
let annualQueryOptions;
const component = await load('app/components/analytics/StatsClient.tsx', {
  '@tanstack/react-query': { useQuery: options => {
    if (options.queryKey[1] === 'year') annualQueryOptions = options;
    return { data: options.queryKey[1] === 'year' && !failure ? annual : undefined, isError: failure, isPending: false };
  } },
  '../../hooks/useIndexedMarkets': { useExplorePage: () => ({ data: { items: [] } }) },
  '../../lib/explore-page': { DEFAULT_EXPLORE_OPTIONS: {} },
  '../explore/VsTable': { VsTableView: () => null },
  './MetricGlyph': { __esModule: true, default: () => null },
  '../DesignIcon': { __esModule: true, default: () => null },
});
let html = renderToStaticMarkup(React.createElement(component.default));
assert.match(html, /Annual · 2028/);
assert.match(html, /Jan: 0 ETH/);
assert.match(html, /height:0%/);
assert.doesNotMatch(html, /NaN|Infinity|Jan: \$/);
assert.equal(annualQueryOptions.refetchInterval(), 300000);
clock = new Date('2028-12-31T23:59:59.900Z');
assert.equal(annualQueryOptions.refetchInterval(), 200, 'Visible page refreshes when the calendar changes');
clock = new Date('2027-03-05T12:00:00Z'); quote = { value: 2000 };
annual = await db.getAnalytics('year');
html = renderToStaticMarkup(React.createElement(component.default));
assert.match(html, /Annual · 2027/);
assert.match(html, /Feb: \$6,000\.00/);
assert.match(html, /Mar: \$0\.00/);
assert.match(html, /height:100%/);
assert.match(html, /height:0%/);
failure = true;
html = renderToStaticMarkup(React.createElement(component.default));
assert.match(html, /Annual data is temporarily unavailable/);
assert.doesNotMatch(html, /Annual · 2027|Feb: /);
console.log('Annual analytics checks passed: UTC calendar windows, chronological recorded months, empty current month, year/month rollovers, SQL bounds, real totals, ETH fallback and chart states.');
