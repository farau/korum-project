import { NextResponse } from "next/server";
import { getWalletSession } from "../../../lib/auth/session";
import { getManagedVersus } from "../../../lib/db/managed-versus";

export async function GET() {
  const session = await getWalletSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  try {
    const response = NextResponse.json(await getManagedVersus(session.address));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    console.error("Unable to read managed Versus.", error);
    return NextResponse.json({ error: "Managed Versus are temporarily unavailable." }, { status: 503 });
  }
}
