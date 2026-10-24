import { NextResponse } from "next/server";
import { getWalletSession } from "../../../lib/auth/session";
import { getProfileHoldings } from "../../../lib/db/profile-holdings";

export async function GET(request: Request) {
  const session = await getWalletSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const expectedWallet = request.headers.get("X-Wallet-Address");
  if (expectedWallet && expectedWallet.toLowerCase() !== session.address.toLowerCase()) {
    return NextResponse.json({ error: "The profile wallet changed." }, { status: 409 });
  }

  try {
    const holdings = await getProfileHoldings(session.address);
    const response = NextResponse.json(holdings);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Korum-Wallet", session.address.toLowerCase());
    return response;
  } catch (error) {
    console.error("Unable to load wallet holdings.", error);
    return NextResponse.json({ error: "Holdings are temporarily unavailable." }, { status: 503 });
  }
}
