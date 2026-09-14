import { getTokenChart, isMarketRange, tokenChartCacheSeconds } from "../../../../lib/db/markets";
import type { CacheDiagnostic } from "../../../../lib/cache/redis";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const rangeValue = new URL(request.url).searchParams.get("range") ?? "1h";
  if (!isMarketRange(rangeValue)) {
    return Response.json({ error: "Unsupported chart range." }, { status: 400 });
  }
  const cache: CacheDiagnostic = { status: "BYPASS" };

  try {
    const chart = await getTokenChart(token, rangeValue, cache);
    return chart
      ? Response.json(chart, {
          headers: {
            "Cache-Control": `public, max-age=2, s-maxage=${tokenChartCacheSeconds(rangeValue)}, stale-while-revalidate=${tokenChartCacheSeconds(rangeValue) * 3}`,
            "X-Korum-Cache": cache.status,
            "X-Korum-Cache-Layer": cache.status === "HIT" ? "redis" : cache.status === "DEDUPED" ? "memory" : "postgres",
          },
        })
      : Response.json({ error: "Invalid token address." }, { status: 400 });
  } catch (error) {
    console.error("Unable to read the indexed token chart.", error);
    return Response.json({ error: "Market data is temporarily unavailable." }, { status: 503 });
  }
}
