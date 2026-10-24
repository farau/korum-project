import { NextResponse, type NextRequest } from "next/server";
import { consumeRateLimit, redisCacheKey, type CacheDiagnostic } from "../../lib/cache/redis";
import { requestIdentity } from "../../lib/request-identity";
import { getTraderLeaderboard, LEADERBOARD_CACHE_SECONDS } from "../../lib/db/leaderboard";
import type { LeaderboardSort } from "../../lib/leaderboard";

export async function GET(request: NextRequest) {
  const pageValue = request.nextUrl.searchParams.get("page") ?? "1";
  const sortValue = request.nextUrl.searchParams.get("sort") ?? "pnl";
  const search = request.nextUrl.searchParams.get("search") ?? "";
  if (!/^\d{1,7}$/.test(pageValue) || Number(pageValue) < 1 || !["pnl", "volume"].includes(sortValue) || search.length > 64) {
    return NextResponse.json({ error: "Invalid leaderboard parameters." }, { status: 400 });
  }

  try {
    if (search.trim()) {
      const budget = await consumeRateLimit(redisCacheKey("rate-limit", "leaderboard-search", requestIdentity(request)), 1, 30, 60);
      if (!budget.allowed) {
        return NextResponse.json({ error: "Leaderboard search rate limit exceeded." }, {
          status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(budget.retryAfterSeconds) },
        });
      }
    }
    const cache: CacheDiagnostic = { status: "BYPASS" };
    const leaderboard = await getTraderLeaderboard({
      page: Number(pageValue),
      sort: sortValue as LeaderboardSort,
      search,
    }, cache);
    const response = NextResponse.json(leaderboard);
    response.headers.set(
      "Cache-Control",
      search.trim()
        ? "private, no-store"
        : `public, max-age=0, s-maxage=${LEADERBOARD_CACHE_SECONDS}, stale-while-revalidate=${LEADERBOARD_CACHE_SECONDS}`,
    );
    response.headers.set("X-Korum-Cache", cache.status);
    response.headers.set("X-Korum-Cache-Layer", cache.status === "HIT" ? "redis" : cache.status === "DEDUPED" ? "memory" : "postgres");
    return response;
  } catch (error) {
    console.error("Unable to read the trader leaderboard.", error);
    return NextResponse.json({ error: "The leaderboard is temporarily unavailable." }, { status: 503 });
  }
}
