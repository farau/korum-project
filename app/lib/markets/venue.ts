export const GRADUATING_MESSAGE = "Token has bonded and is graduating";

export type TokenVenue = {
  tokenAddress: string;
  chainId: number;
  curveStatus: number;
  poolId: string | null;
};

export type PoolChart = {
  status: "ready" | "pending" | "unsupported";
  url: string | null;
  embedUrl: string | null;
};

export function usesKorumCandles(status: number | undefined) {
  return status !== 2 && status !== 3;
}

// Contract observations of migration/graduation override the indexed snapshot.
// An older curve read must not reopen trading after the indexer observed migration.
export function resolveCurveStatus(indexedStatus: number | undefined, observedStatus: number | undefined) {
  if (observedStatus === 2 || observedStatus === 3) return observedStatus;
  if (indexedStatus === 2 || indexedStatus === 3) return indexedStatus;
  return observedStatus ?? indexedStatus;
}

// Only the pool emitted by Korum's graduation may become the embedded market.
// Never select another pool for the token or trust a URL returned by the API.
export function verifiedDexscreenerChart(data: unknown, venue: TokenVenue): PoolChart | null {
  if (venue.chainId !== 4663 || venue.curveStatus !== 3 || !/^0x[\da-f]{64}$/i.test(venue.poolId ?? "")) return null;
  const pairs = data && typeof data === "object" && "pairs" in data ? data.pairs : null;
  if (!Array.isArray(pairs)) return null;
  const pool = venue.poolId!.toLowerCase();
  const pair = pairs.find(pair => pair && pair.chainId === "robinhood"
    && pair.dexId === "uniswap" && Array.isArray(pair.labels) && pair.labels.includes("v4")
    && typeof pair.pairAddress === "string" && pair.pairAddress.toLowerCase() === pool
    && typeof pair.baseToken?.address === "string" && pair.baseToken.address.toLowerCase() === venue.tokenAddress.toLowerCase()
    && typeof pair.quoteToken?.address === "string" && pair.quoteToken.address.toLowerCase() === "0x0000000000000000000000000000000000000000");
  if (!pair) return null;
  const url = `https://dexscreener.com/robinhood/${pool}`;
  return { status: "ready", url, embedUrl: `${url}?embed=1&info=0&trades=0&theme=dark` };
}
