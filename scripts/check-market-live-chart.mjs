import assert from 'node:assert/strict';
import { mergeChartTrades, slideChart, replaceChartHead } from '../app/lib/live/chart.ts';
const token = `0x${'a'.repeat(40)}`;
const empty = {
  points: [], quoteUsd: 2500, intervalSeconds: 1, windowStart: 701, windowEnd: 1000,
  hasMore: false, lastTradeTimestamp: null, lastTradeCursor: null,
  priorPrice: null, priorMarketCap: null, priorPriceUp: null, priorMarketCapUp: null, priorTimestamp: null,
};
const first = { token, cursor: { block: 1, log: 0 }, previous: null, timestamp: 1000, price: 10, marketCap: 100, volumeQuote: 2 };
const second = { ...first, cursor: { block: 1, log: 1 }, previous: first.cursor, price: 12, marketCap: 90, volumeQuote: 3 };
const third = { ...first, cursor: { block: 2, log: 0 }, previous: second.cursor, timestamp: 1001, price: 9, marketCap: 120, volumeQuote: 4 };
const merged = mergeChartTrades(empty, [first, second, third], 1001);
assert.equal(merged.points.length, 2);
assert.deepEqual(merged.points[0], {
  t: 1000, open: 10, high: 12, low: 10, close: 12, price: 12,
  openMarketCap: 100, highMarketCap: 100, lowMarketCap: 90, closeMarketCap: 90, marketCap: 90,
  blockNumber: 1, volumeQuote: 5, tradeCount: 2, synthetic: false,
});
assert.equal(merged.points[1].open, 12);
assert.equal(merged.points[1].openMarketCap, 90);
assert.equal(merged.points[1].highMarketCap, 120);
assert.equal(merged.points[1].volumeQuote, 4);
assert.deepEqual(mergeChartTrades(merged, [first, second, third], 1001), merged, 'Retries must not double-count volume');
assert.equal(mergeChartTrades(empty, [third], 1001), null, 'A missed predecessor must trigger reconciliation');
assert.equal(mergeChartTrades(merged, [{ ...third, cursor: { block: 3, log: 0 }, previous: third.cursor, timestamp: 999 }], 1001), null);
assert.equal(mergeChartTrades(empty, [second, first], 1000), null, 'Out-of-order delivery must not silently invent candles');
const slid = slideChart(merged, 1301);
assert.equal(slid.windowStart, 1002);
assert.equal(slid.windowEnd, 1301);
assert.equal(slid.points.length, 0);
assert.equal(slid.priorPrice, 9);
assert.equal(slid.priorMarketCap, 120);
assert.equal(slid.hasMore, false);
assert.deepEqual(slid.lastTradeCursor, third.cursor);
const minute = mergeChartTrades({ ...empty, intervalSeconds: 60, windowStart: 0, windowEnd: 960 }, [first, second, third], 1001);
assert.equal(minute.points.length, 1);
assert.equal(minute.points[0].high, 12);
assert.equal(minute.points[0].low, 9);
assert.equal(minute.points[0].volumeQuote, 9);
assert.equal(minute.points[0].tradeCount, 3);
const seeded = mergeChartTrades({ ...empty, priorPrice: 15, priorMarketCap: 80, lastTradeCursor: first.cursor, lastTradeTimestamp: 700 }, [second], 1000);
assert.equal(seeded.points[0].open, 15);
assert.equal(seeded.points[0].high, 15);
assert.equal(seeded.points[0].openMarketCap, 80);
assert.deepEqual(empty.points, [], 'Snapshot input must remain immutable');
console.log('Live chart checks passed: OHLC, market cap, volume, same-block trades, duplicate delivery, gaps, ordering, sliding retention and minute aggregation.');

const history = { ...minute, points: [], windowStart: 0, windowEnd: 900 };
const oldHead = { ...minute, windowStart: 960, windowEnd: 18900 };
const withHistory = { pages: [oldHead, history], pageParams: [undefined, 960] };
const newHead = { ...oldHead, points: [], windowStart: 1020, windowEnd: 18960 };
const replacement = replaceChartHead(withHistory, newHead);
assert.equal(replacement.pages[1].points[0].t, 960);
assert.equal(replacement.pages[1].windowEnd, 960);
assert.deepEqual(replacement.pageParams, withHistory.pageParams);
assert.deepEqual(withHistory.pages[1].points, [], 'History input remains immutable');
console.log('Loaded history is retained when the latest page advances.');
