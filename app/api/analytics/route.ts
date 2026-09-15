import { ANALYTICS_CACHE_SECONDS, getAnalytics, type AnalyticsPeriod } from "../../lib/db/analytics";
import type { CacheDiagnostic } from "../../lib/cache/redis";

const PERIODS = new Set<AnalyticsPeriod>(["day", "week", "month"]);

export async function GET(request: Request) {
  const requestedPeriod = new URL(request.url).searchParams.get("period") as AnalyticsPeriod | null;
  const period = requestedPeriod && PERIODS.has(requestedPeriod) ? requestedPeriod : "day";
  const cache: CacheDiagnostic = { status: "BYPASS" };

  try {
    const result = await getAnalytics(period, cache);
    return Response.json(result, {
      headers: {
        "Cache-Control": `public, max-age=300, s-maxage=${ANALYTICS_CACHE_SECONDS}, stale-while-revalidate=${ANALYTICS_CACHE_SECONDS * 3}`,
        "X-Korum-Cache": cache.status,
        "X-Korum-Cache-Layer": cache.status === "HIT" ? "redis" : cache.status === "DEDUPED" ? "memory" : "postgres",
      },
    });
  } catch (error) {
    console.error(`Unable to read ${period} analytics.`, error);
    return Response.json({ error: "Analytics are temporarily unavailable." }, { status: 503 });
  }
}
