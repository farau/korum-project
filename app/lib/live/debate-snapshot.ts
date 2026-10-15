import type { IndexedDebateRow } from "../db/debates";

export type WindowTrade = { time: number; sqrtPrice: string; volume: string };
type SideWindows = { Volume24h: string; Trades24h: number; PriceHistory: string[]; ReferencePrices: Array<string | null> };
export type WindowedDebateRow = IndexedDebateRow & {
  [K in keyof SideWindows as `tokenA${K}`]: SideWindows[K]
} & { [K in keyof SideWindows as `tokenB${K}`]: SideWindows[K] };
const WINDOWS = [300, 3600, 21600, 86400];

// Time passing only changes the rolling windows, not the indexed market state.
// Retain the old 24h anchor so a quiet snapshot remains correct indefinitely.
export function slideDebateRow(row: IndexedDebateRow, now: number): WindowedDebateRow {
  const next = { ...row } as WindowedDebateRow;
  for (const side of ["A", "B"] as const) {
    const timeline = row[`token${side}WindowTrades`];
    const reference = row[`token${side}PriorPrice`];
    next[`token${side}ReferencePrices`] = WINDOWS.map(seconds => {
      let price = reference;
      for (const trade of timeline) {
        if (trade.time > now - seconds) break;
        price = trade.sqrtPrice;
      }
      return price;
    });
    const recent = timeline.filter(trade => trade.time >= now - 86400 && trade.time <= now);
    next[`token${side}Volume24h`] = recent.reduce((sum, trade) => sum + BigInt(trade.volume), BigInt(0)).toString();
    next[`token${side}Trades24h`] = recent.length;
    next[`token${side}PriceHistory`] = recent.slice(-96).reverse().map(trade => trade.sqrtPrice);
  }
  return next;
}
