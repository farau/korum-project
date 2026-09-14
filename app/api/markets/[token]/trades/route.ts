import { getTokenTrades, TOKEN_TRADES_CACHE_SECONDS } from "../../../../lib/db/markets";
import type { CacheDiagnostic } from "../../../../lib/cache/redis";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const requestedLimit = Number(new URL(request.url).searchParams.get("limit") ?? 100);
  const cache: CacheDiagnostic = { status: "BYPASS" };

  try {
    const result = await getTokenTrades(token, Number.isFinite(requestedLimit) ? requestedLimit : 100, cache);
    return result
      ? Response.json(result, {
          headers: {
            "Cache-Control": `public, max-age=2, s-maxage=${TOKEN_TRADES_CACHE_SECONDS}, stale-while-revalidate=${TOKEN_TRADES_CACHE_SECONDS * 3}`,
            "X-Korum-Cache": cache.status,
            "X-Korum-Cache-Layer": cache.status === "HIT" ? "redis" : cache.status === "DEDUPED" ? "memory" : "postgres",
          },
        })
      : Response.json({ error: "Invalid token address." }, { status: 400 });
  } catch (error) {
    console.error("Unable to read indexed token trades.", error);
    return Response.json({ error: "Trade data is temporarily unavailable." }, { status: 503 });
  }
}
