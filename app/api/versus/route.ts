import type { CacheDiagnostic } from '../../lib/cache/redis';
import { getIndexedDebatesWithDiagnostic } from '../../lib/db/debates';
import { getExplorePage } from '../../lib/db/explore';
import { parseExploreOptions } from '../../lib/explore-page';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  let options;
  if (params.get("view") === "explore") {
    try { options = parseExploreOptions(params); }
    catch { return Response.json({ error: "Invalid Explore filters." }, { status: 400 }); }
  }
  const cache: CacheDiagnostic = { status: "BYPASS" };
  try {
    return Response.json(options ? await getExplorePage(options, cache) : await getIndexedDebatesWithDiagnostic(cache), {
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
