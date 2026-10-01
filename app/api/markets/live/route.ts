import { subscribeMarkets } from "../../../lib/live/server";
import { consumeRateLimit, redisCacheKey } from "../../../lib/cache/redis";
import type { MarketNotice } from "../../../lib/live/protocol";
import { createHash } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!process.env.KORUM_GOLDSKY_WEBHOOK_SECRET || !process.env.REDIS_URL) {
    return new Response(null, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30" } });
  }
  const url = new URL(request.url);
  const tokens = new Set((url.searchParams.get("tokens") ?? "").split(",").filter(Boolean));
  if (tokens.size > 20 || [...tokens].some(token => !/^0x[\da-f]{40}$/.test(token))) return new Response(null, { status: 400 });
  const feed = url.searchParams.get("feed") === "1";
  if (!feed && !tokens.size) return new Response(null, { status: 400 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const budget = await consumeRateLimit(redisCacheKey("live", "connections", createHash("sha256").update(ip).digest("hex")), 1, 60, 60);
  if (!budget.allowed) return new Response(null, { status: 429, headers: { "Retry-After": "60" } });
  const encoder = new TextEncoder();
  let dispose = () => {};
  let close = () => {};
  let send: (notice: MarketNotice) => void = () => {};
  try { dispose = await subscribeMarkets(notice => send(notice)); }
  catch { return new Response(null, { status: 503, headers: { "Retry-After": "5" } }); }
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const enqueue = (text: string) => {
        if (closed) return;
        if ((controller.desiredSize ?? 0) <= 0) { close(); return; }
        controller.enqueue(encoder.encode(text));
      };
      const heartbeat = setInterval(() => enqueue(": heartbeat\n\n"), 15_000);
      // Bound connection lifetime; EventSource reconnects and requests a fresh snapshot.
      const lifetime = setTimeout(() => close(), 240_000);
      close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat); clearTimeout(lifetime); dispose();
        request.signal.removeEventListener("abort", close);
        controller.close();
      };
      send = notice => {
        if (!notice.reset && !feed && !notice.tokens.some(token => tokens.has(token))) return;
        enqueue(`event: market\ndata: ${JSON.stringify(notice)}\n\n`);
      };
      request.signal.addEventListener("abort", close, { once: true });
      enqueue('retry: 5000\nevent: ready\ndata: {}\n\n');
      if (request.signal.aborted) close();
    },
    cancel() { close(); },
  });
  return new Response(stream, { headers: {
    "Content-Type": "text/event-stream", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no",
  } });
}
