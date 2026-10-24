import type { IndexedDebateRow } from "../db/debates";

// Compact internal Redis tuples avoid repeating field names for every timestamp.
export type WindowBucket = [time: number, sqrtPrice: string, cumulativeVolume: string, cumulativeTrades: number];
type SideWindows = { Volume24h: string; Trades24h: number; PriceHistory: Array<string | null>; ReferencePrices: Array<string | null> };
export type WindowedDebateRow = IndexedDebateRow & {
  [K in keyof SideWindows as `tokenA${K}`]: SideWindows[K]
} & { [K in keyof SideWindows as `tokenB${K}`]: SideWindows[K] };
const WINDOWS = [300, 3600, 21600, 86400];

// Find the first bucket >= time (or > time for an inclusive upper boundary).
function bound(buckets: WindowBucket[], time: number, inclusive: boolean) {
  let low = 0;
  let high = buckets.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (buckets[middle][0] < time || (inclusive && buckets[middle][0] === time)) low = middle + 1;
    else high = middle;
  }
  return low;
}

// Prefix sums make each rolling read logarithmic in active timestamps, rather
// than linear in trades. The prior anchor keeps quiet snapshots valid indefinitely.
// Sample 96 quarter-hour closing prices, ending at now. Unknown history stays empty.
export function slideDebateRow(row: IndexedDebateRow, now: number): WindowedDebateRow {
  const next = { ...row } as WindowedDebateRow;
  const createdAt = new Date(row.createdAt).getTime() / 1000;
  for (const side of ["A", "B"] as const) {
    const buckets = row[`token${side}WindowBuckets`];
    next[`token${side}ReferencePrices`] = WINDOWS.map(seconds => {
      const last = bound(buckets, now - seconds, true) - 1;
      return last >= 0 ? buckets[last][1] : row[`token${side}PriorPrice`];
    });
    const start = bound(buckets, now - 86400, false);
    const end = bound(buckets, now, true);
    const before = buckets[start - 1];
    const last = buckets[end - 1];
    next[`token${side}Volume24h`] = (BigInt(last?.[2] ?? "0") - BigInt(before?.[2] ?? "0")).toString();
    next[`token${side}Trades24h`] = (last?.[3] ?? 0) - (before?.[3] ?? 0);
    // Newest first, like the existing internal mapper contract. Do not invent
    // a launch price or backfill earlier slots with the first observed trade.
    next[`token${side}PriceHistory`] = Array.from({ length: 96 }, (_, index) => {
      const time = now - index * 900;
      if (!Number.isFinite(createdAt) || time < createdAt) return null;
      const last = bound(buckets, time, true) - 1;
      return last >= 0 ? buckets[last][1] : row[`token${side}PriorPrice`];
    });
  }
  return next;
}
