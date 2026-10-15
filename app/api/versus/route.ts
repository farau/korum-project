import type { CacheDiagnostic } from '../../lib/cache/redis';
import { getIndexedDebatesWithDiagnostic } from '../../lib/db/debates';

export async function GET() {
  const cache: CacheDiagnostic = { status: "BYPASS" };
  try {
    return Response.json(await getIndexedDebatesWithDiagnostic(cache), {
      headers: {
        "Cache-Control": "no-store",
        "X-Korum-Cache": cache.status,
        "X-Korum-Cache-Layer": cache.status === "HIT" ? "redis" : cache.status === "DEDUPED" ? "shared" : "postgres",
      },
    });
  } catch (error) {
    console.error("Unable to load indexed versus.", error);
    return Response.json({ error: "Versus data is temporarily unavailable." }, { status: 503 });
  }
}
