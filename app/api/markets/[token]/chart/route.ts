import { getTokenChart, isMarketRange, TokenChartUnavailable } from "../../../../lib/db/markets";
import type { CacheDiagnostic } from "../../../../lib/cache/redis";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const search = new URL(request.url).searchParams;
  const rangeValue = search.get("range") ?? "1m";
  if (!isMarketRange(rangeValue)) {
    return Response.json({ error: "Unsupported chart range." }, { status: 400 });
  }
  const limitValue = search.get("limit");
  const beforeValue = search.get("before");
  const limit = limitValue === null ? 300 : Number(limitValue);
  const before = beforeValue === null ? undefined : Number(beforeValue);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500 || (before !== undefined && (!Number.isSafeInteger(before) || before < 1))) {
    return Response.json({ error: "Invalid chart pagination." }, { status: 400 });
  }
  if (rangeValue === "1s" && (before !== undefined || limit > 300)) {
    return Response.json({ error: "The 1s chart is limited to the latest five minutes." }, { status: 400 });
  }
  const cache: CacheDiagnostic = { status: "BYPASS" };

  try {
    const chart = await getTokenChart(token, rangeValue, limit, before, cache);
    return chart
      ? Response.json(chart, {
          headers: {
            "Cache-Control": "no-store",
            "X-Korum-Cache": cache.status,
            "X-Korum-Cache-Layer": cache.status === "HIT" ? "redis" : cache.status === "DEDUPED" ? "memory" : "postgres",
          },
        })
      : Response.json({ error: "Invalid token address." }, { status: 400 });
  } catch (error) {
    if (error instanceof TokenChartUnavailable) {
      return Response.json({ error: error.message, ...error.venue }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    console.error("Unable to read the indexed token chart.", error);
    return Response.json({ error: "Market data is temporarily unavailable." }, { status: 503 });
  }
}
