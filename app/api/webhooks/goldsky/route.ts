import { timingSafeEqual } from "node:crypto";
import { KORUM_CHAIN_ID } from "../../../config/korum-network";
import { MAX_WEBHOOK_BYTES, parseTradeNotices } from "../../../lib/live/protocol";
import { projectionsReady, publishMarketNotice } from "../../../lib/live/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.KORUM_GOLDSKY_WEBHOOK_SECRET;
  if (!secret || secret.length < 32) return Response.json({ error: "Webhook not configured" }, { status: 503 });
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: "Missing body" }, { status: 400 });
  let notices;
  try {
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_WEBHOOK_BYTES) {
        await reader.cancel();
        return Response.json({ error: "Payload too large" }, { status: 413 });
      }
      chunks.push(value);
    }
    notices = parseTradeNotices(JSON.parse(Buffer.concat(chunks).toString("utf8")), KORUM_CHAIN_ID);
  } catch { return Response.json({ error: "Invalid trade notifications" }, { status: 400 }); }
  try {
    for (let attempt = 0; attempt < 8; attempt++) {
      if (await projectionsReady(notices)) {
        await publishMarketNotice(notices);
        return Response.json({ accepted: notices.length }, { headers: { "Cache-Control": "no-store" } });
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    // Goldsky retries 503 responses. Do not ACK a notification prematurely.
    return Response.json({ error: "Projection pending" }, { status: 503, headers: { "Retry-After": "1" } });
  } catch {
    return Response.json({ error: "Live delivery unavailable" }, { status: 503, headers: { "Retry-After": "1" } });
  }
}
