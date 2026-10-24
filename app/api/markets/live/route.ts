import { getWalletSession } from "../../../lib/auth/session";
import { profileWalletHash } from "../../../lib/live/profile-cache";
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
  const profile = url.searchParams.get("profile");
  const profileTokens = new Set((url.searchParams.get("profileTokens") ?? "").split(",").filter(Boolean));
  if (profileTokens.size > 25 || [...profileTokens].some(token => !/^0x[\da-f]{40}$/.test(token))) return new Response(null, { status: 400 });
  if (profile && !/^0x[\da-f]{40}$/.test(profile)) return new Response(null, { status: 400 });
  if (profile) {
    const session = await getWalletSession();
    if (!session || session.address.toLowerCase() !== profile) return new Response(null, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const profileHash = profile ? profileWalletHash(profile) : null;
  if (!feed && !tokens.size && !profile) return new Response(null, { status: 400 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const budget = await consumeRateLimit(redisCacheKey("live", "connections", createHash("sha256").update(ip).digest("hex")), 1, 60, 60);
  if (!budget.allowed) return new Response(null, { status: 429, headers: { "Retry-After": "60" } });
  const encoder = new TextEncoder();
  let dispose = () => {};
  let close = () => {};
  let cancelled = false;
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
        if (!cancelled) controller.close();
      };
      send = notice => {
        const profileChanged = Boolean(profileHash && (notice.reset || notice.profileWallets === undefined
          || notice.profileWallets.includes(profileHash) || notice.tokens.some(token => profileTokens.has(token))));
        if (!notice.reset && !feed && !profileChanged && !notice.tokens.some(token => tokens.has(token))) return;
        // Feed subscribers need all token notices, but only chart interests need prices.
        const payload = { revision: notice.revision, tokens: notice.tokens, reset: notice.reset,
          trades: notice.trades?.filter(trade => tokens.has(trade.token)),
          profileWallet: profile ?? undefined, profileChanged };
        enqueue(`event: market\ndata: ${JSON.stringify(payload)}\n\n`);
      };
      request.signal.addEventListener("abort", close, { once: true });
      enqueue('retry: 5000\nevent: ready\ndata: {}\n\n');
      if (request.signal.aborted) close();
    },
    cancel() { cancelled = true; close(); },
  });
  return new Response(stream, { headers: {
    "Content-Type": "text/event-stream", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no",
  } });
}
