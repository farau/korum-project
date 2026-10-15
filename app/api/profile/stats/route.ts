import { NextResponse } from "next/server";
import { getWalletSession } from "../../../lib/auth/session";
import { getUserProfileStats } from "../../../lib/db/profile-stats";

// Refresh derived statistics without loading the user's identity or referrer.
export async function GET() {
  const session = await getWalletSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  }
  try {
    const stats = await getUserProfileStats(session.address);
    return NextResponse.json({ address: session.address, stats }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Unable to refresh profile statistics.", error);
    return NextResponse.json({ error: "Profile statistics are temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
