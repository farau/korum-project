import type { Debate, DebateToken } from "./debates";

export const EXPLORE_PAGE_SIZE = 12;
export type ExploreSort = "trending" | "marketCap" | "volume" | "holders" | "recent";
export type ExploreAge = "all" | "1h" | "24h" | "7d";
export type ExploreOptions = { category: string; sort: ExploreSort; age: ExploreAge; marketCapMin: number; tradersMin: number; page: number };
export type ExplorePage = { items: Debate[]; page: number; total: number; totalPages: number; catalogTotal: number };
export const DEFAULT_EXPLORE_OPTIONS: ExploreOptions = { category: "HotTake", sort: "trending", age: "all", marketCapMin: 0, tradersMin: 0, page: 1 };
export function normalizeCategory(value: string) { return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim(); }
export function parseExploreOptions(params: URLSearchParams): ExploreOptions {
  const sort = params.get("sort") ?? "trending", age = params.get("age") ?? "all";
  const category = params.get("category") ?? "HotTake";
  const page = Number(params.get("page") ?? 1), marketCapMin = Number(params.get("marketCapMin") ?? 0), tradersMin = Number(params.get("tradersMin") ?? 0);
  if (!["trending", "marketCap", "volume", "holders", "recent"].includes(sort)
    || !["all", "1h", "24h", "7d"].includes(age) || category.length > 64
    || !Number.isSafeInteger(page) || page < 1 || page > 1_000_000
    || !Number.isFinite(marketCapMin) || marketCapMin < 0 || marketCapMin > 1e24
    || !Number.isSafeInteger(tradersMin) || tradersMin < 0) throw new Error("Invalid Explore filters");
  return { category, sort: sort as ExploreSort, age: age as ExploreAge, page, marketCapMin, tradersMin };
}

// Only fields rendered by Explore's cards and table cross the network.
function listToken(token: DebateToken | undefined): DebateToken | undefined {
  if (!token) return undefined;
  const { name, symbol, address, image, marketCap, holders, traderCount, volume24h, change5m, change1h, change6h, change24h, priceHistory } = token;
  return { name, symbol, address, image, marketCap, holders, traderCount, volume24h, change5m, change1h, change6h, change24h, priceHistory };
}
export function exploreItem(debate: Debate): Debate {
  const { id, sideA, sideB, category, sideAPercentage, volume24h, participantCount, createdMinutesAgo, createdAtTimestamp, marketCurrency } = debate;
  return { id, sideA, sideB, category, sideAPercentage, volume24h, participantCount, createdMinutesAgo, createdAtTimestamp, marketCurrency,
    tokenA: listToken(debate.tokenA), tokenB: listToken(debate.tokenB) };
}
