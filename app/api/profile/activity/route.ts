import { NextResponse, type NextRequest } from "next/server";
import { getWalletSession } from "../../../lib/auth/session";
import type { CacheDiagnostic } from "../../../lib/cache/redis";
import { getUserProfileActivity } from "../../../lib/db/profile-activity";

export async function GET(request: NextRequest) {
  const session = await getWalletSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const suppliedPage = request.nextUrl.searchParams.get("page") ?? "1";
  if (!/^\d{1,7}$/.test(suppliedPage) || Number(suppliedPage) < 1) {
    return NextResponse.json({ error: "Invalid activity page." }, { status: 400 });
  }

  try {
    const cache: CacheDiagnostic = { status: "BYPASS" };
    const activity = await getUserProfileActivity(session.address, Number(suppliedPage), cache);
    const response = NextResponse.json(activity);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Korum-Cache", cache.status);
    response.headers.set("X-Korum-Cache-Layer", cache.status === "HIT" ? "redis" : cache.status === "DEDUPED" ? "memory" : "postgres");
    return response;
  } catch (error) {
    console.error("Unable to read wallet activity.", error);
    return NextResponse.json({ error: "The activity service is temporarily unavailable." }, { status: 503 });
  }
}
