import { requestIdentity } from "../../../lib/request-identity";
import { consumeRateLimit, redisCacheKey, type CacheDiagnostic } from "../../../lib/cache/redis";
import {
  INDEXED_DEBATE_SEARCH_CACHE_SECONDS,
  INDEXED_DEBATE_SEARCH_LIMIT,
  searchIndexedDebatesWithDiagnostic,
} from "../../../lib/db/debates";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SEARCH_MIN_LENGTH = 2;
const SEARCH_MAX_LENGTH = 100;
const SEARCH_RATE_LIMIT = 30;
const SEARCH_RATE_WINDOW_SECONDS = 60;

function rateLimitHeaders(remaining: number) {
  return {
    "X-RateLimit-Limit": String(SEARCH_RATE_LIMIT),
    "X-RateLimit-Remaining": String(remaining),
  };
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < SEARCH_MIN_LENGTH) {
    return Response.json([], { headers: { "Cache-Control": "no-store" } });
  }
  if (query.length > SEARCH_MAX_LENGTH) {
    return Response.json({ error: "The search query is too long." }, { status: 400 });
  }

  const rateLimit = await consumeRateLimit(
    redisCacheKey("rate-limit", "debate-search", requestIdentity(request)),
    1,
    SEARCH_RATE_LIMIT,
    SEARCH_RATE_WINDOW_SECONDS,
  );
  if (!rateLimit.allowed) {
    return Response.json(
      { error: "Versus search rate limit exceeded." },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(rateLimit.retryAfterSeconds),
          ...rateLimitHeaders(0),
        },
      },
    );
  }

  try {
    const cacheDiagnostic: CacheDiagnostic = { status: "BYPASS" };
    const debates = await searchIndexedDebatesWithDiagnostic(
      query,
      cacheDiagnostic,
      INDEXED_DEBATE_SEARCH_LIMIT,
    );
    return Response.json(debates, {
      headers: {
        "Cache-Control": `public, max-age=15, s-maxage=${INDEXED_DEBATE_SEARCH_CACHE_SECONDS}, stale-while-revalidate=90`,
        "X-Korum-Cache": cacheDiagnostic.status,
        ...rateLimitHeaders(rateLimit.remaining),
      },
    });
  } catch (error) {
    console.error("Unable to search indexed versus.", error);
    return Response.json(
      { error: "Versus search is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store", ...rateLimitHeaders(rateLimit.remaining) } },
    );
  }
}
