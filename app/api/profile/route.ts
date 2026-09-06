import { NextResponse } from "next/server";
import { getWalletSession } from "../../lib/auth/session";

export async function GET() {
  const session = await getWalletSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const response = NextResponse.json({
    walletAddress: session.address,
    chainId: session.chainId,
    referralCode: session.address,
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
