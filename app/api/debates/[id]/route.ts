import type { CacheDiagnostic } from "../../../lib/cache/redis";
import { getIndexedDebateByIdWithDiagnostic, INDEXED_DEBATES_CACHE_SECONDS } from "../../../lib/db/debates";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const cache: CacheDiagnostic = { status: "BYPASS" };

  try {
    const debate = await getIndexedDebateByIdWithDiagnostic(id, cache);
    return debate
      ? Response.json(debate, {
          headers: {
            "Cache-Control": `public, max-age=5, s-maxage=${INDEXED_DEBATES_CACHE_SECONDS}, stale-while-revalidate=${INDEXED_DEBATES_CACHE_SECONDS * 3}`,
            "X-Korum-Cache": cache.status,
            "X-Korum-Cache-Layer": cache.status === "HIT" ? "redis" : cache.status === "DEDUPED" ? "memory" : "postgres",
          },
        })
      : Response.json({ error: "Versus not found." }, { status: 404 });
  } catch (error) {
    console.error(`Unable to load indexed versus ${id}.`, error);
    return Response.json({ error: "The Railway indexer is temporarily unavailable." }, { status: 503 });
  }
}
