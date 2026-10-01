import {
  getRecentMarketTrades,
} from "../../../lib/db/markets";
import type { CacheDiagnostic } from "../../../lib/cache/redis";

export async function GET(request: Request) {
  const requestedLimit = Number(new URL(request.url).searchParams.get("limit") ?? 50);
  const cache: CacheDiagnostic = { status: "BYPASS" };

  try {
    const result = await getRecentMarketTrades(Number.isFinite(requestedLimit) ? requestedLimit : 50, cache);
    return Response.json(result, {
      headers: {
        "Cache-Control": "no-store",
        "X-Korum-Cache": cache.status,
        "X-Korum-Cache-Layer": cache.status === "HIT" ? "redis" : cache.status === "DEDUPED" ? "memory" : "postgres",
      },
    });
  } catch (error) {
    console.error("Unable to read the recent market feed.", error);
    return Response.json({ error: "Recent market activity is temporarily unavailable." }, { status: 503 });
  }
}
