import type { CacheDiagnostic } from '../../lib/cache/redis';
import { getIndexedDebatesWithDiagnostic, INDEXED_DEBATES_CACHE_SECONDS } from '../../lib/db/debates';

export async function GET() {
  const cache: CacheDiagnostic = { status: "BYPASS" };
  try {
    return Response.json(await getIndexedDebatesWithDiagnostic(cache), {
      headers: {
        "Cache-Control": `public, max-age=5, s-maxage=${INDEXED_DEBATES_CACHE_SECONDS}, stale-while-revalidate=${INDEXED_DEBATES_CACHE_SECONDS * 3}`,
        "X-Korum-Cache": cache.status,
        "X-Korum-Cache-Layer": cache.status === "HIT" ? "redis" : cache.status === "DEDUPED" ? "memory" : "postgres",
      },
    });
  } catch (error) {
    console.error("Unable to load indexed versus.", error);
    return Response.json({ error: "The Railway indexer is temporarily unavailable." }, { status: 503 });
  }
}
