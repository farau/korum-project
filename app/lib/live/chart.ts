// Shared snapshot and incremental chart model. Values remain in ETH; the UI
// applies its selected display currency after merging live trades.
export type TradeCursor = { block: number; log: number };
export type ChartTrade = {
  token: string;
  cursor: TradeCursor;
  previous: TradeCursor | null;
  timestamp: number;
  price: number;
  marketCap: number;
  volumeQuote: number;
};
export type ChartCandle = {
  t: number; open: number; high: number; low: number; close: number; price: number;
  openMarketCap: number; highMarketCap: number; lowMarketCap: number;
  closeMarketCap: number; marketCap: number;
  blockNumber: number; volumeQuote: number; tradeCount: number; synthetic: false;
};
export type ChartSnapshot = {
  points: ChartCandle[];
  quoteUsd: number | null;
  intervalSeconds: number;
  windowStart: number; windowEnd: number; hasMore: boolean;
  lastTradeTimestamp: number | null;
  lastTradeCursor: TradeCursor | null;
  priorPrice: number | null; priorMarketCap: number | null;
  priorPriceUp: boolean | null; priorMarketCapUp: boolean | null;
  priorTimestamp: number | null;
};
export const SECOND_CHART_POINTS = 300;
export function compareCursor(a: TradeCursor, b: TradeCursor) {
  return a.block - b.block || a.log - b.log;
}

// Sliding a window is local work, including seconds with no trades. Retain the
// last removed price as the seed for unchanged-price ticks in an empty window.
export function slideChart<T extends ChartSnapshot>(page: T, now: number): T {
  const end = Math.floor(now / page.intervalSeconds) * page.intervalSeconds;
  if (end <= page.windowEnd) return page;
  const start = end - (page.intervalSeconds === 1 ? SECOND_CHART_POINTS - 1 : (page.windowEnd - page.windowStart) / page.intervalSeconds) * page.intervalSeconds;
  const removed = page.points.filter(point => point.t < start).at(-1);
  return {
    ...page, windowStart: start, windowEnd: end,
    points: page.points.filter(point => point.t >= start),
    ...(removed ? {
      priorPrice: removed.close, priorMarketCap: removed.closeMarketCap,
      priorPriceUp: removed.close >= removed.open,
      priorMarketCapUp: removed.closeMarketCap >= removed.openMarketCap,
      priorTimestamp: removed.t,
    } : {}),
    hasMore: page.intervalSeconds === 1 ? false : page.hasMore || Boolean(removed),
  };
}

// null means that a predecessor is missing or an older bucket changed: recover
// from PostgreSQL rather than inventing an OHLC/volume for an incomplete stream.
export function mergeChartTrades<T extends ChartSnapshot>(page: T, trades: ChartTrade[], now: number): T | null {
  let next = page;
  for (const trade of trades) {
    if (next.lastTradeCursor && compareCursor(trade.cursor, next.lastTradeCursor) <= 0) continue;
    if (trade.previous === null ? next.lastTradeCursor !== null
      : !next.lastTradeCursor || compareCursor(trade.previous, next.lastTradeCursor) !== 0) return null;
    if (next.lastTradeTimestamp !== null && trade.timestamp < next.lastTradeTimestamp) return null;
    const t = Math.floor(trade.timestamp / next.intervalSeconds) * next.intervalSeconds;
    if (t < next.windowStart) return null;
    const points = [...next.points];
    const last = points.at(-1);
    if (last && t < last.t) return null;
    if (last?.t === t) {
      points[points.length - 1] = {
        ...last, high: Math.max(last.high, trade.price), low: Math.min(last.low, trade.price),
        close: trade.price, price: trade.price,
        highMarketCap: Math.max(last.highMarketCap, trade.marketCap),
        lowMarketCap: Math.min(last.lowMarketCap, trade.marketCap),
        closeMarketCap: trade.marketCap, marketCap: trade.marketCap,
        volumeQuote: last.volumeQuote + trade.volumeQuote, tradeCount: last.tradeCount + 1,
        blockNumber: trade.cursor.block,
      };
    } else {
      const open = last?.close ?? next.priorPrice ?? trade.price;
      const openMarketCap = last?.closeMarketCap ?? next.priorMarketCap ?? trade.marketCap;
      points.push({
        t, open, high: Math.max(open, trade.price), low: Math.min(open, trade.price),
        close: trade.price, price: trade.price, openMarketCap,
        highMarketCap: Math.max(openMarketCap, trade.marketCap),
        lowMarketCap: Math.min(openMarketCap, trade.marketCap),
        closeMarketCap: trade.marketCap, marketCap: trade.marketCap,
        blockNumber: trade.cursor.block, volumeQuote: trade.volumeQuote, tradeCount: 1, synthetic: false,
      });
    }
    next = { ...next, points, lastTradeCursor: trade.cursor, lastTradeTimestamp: trade.timestamp };
  }
  return slideChart(next, now);
}

// Preserve already loaded history when the latest window advances; closed
// candles move into the adjacent history page instead of being fetched again.
export function replaceChartHead<T extends ChartSnapshot, D extends { pages: T[] }>(data: D, page: T): D {
  if (data.pages.length < 2 || page.intervalSeconds === 1) return { ...data, pages: [page, ...data.pages.slice(1)] };
  const history = data.pages[1];
  const points = new Map(history.points.map(point => [point.t, point]));
  for (const point of data.pages[0].points) {
    if (point.t < page.windowStart) points.set(point.t, point);
  }
  const extended = {
    ...history,
    points: [...points.values()].sort((a, b) => a.t - b.t),
    windowEnd: Math.max(history.windowEnd, page.windowStart - page.intervalSeconds),
  };
  return { ...data, pages: [page, extended, ...data.pages.slice(2)] };
}
