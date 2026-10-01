import { NextResponse } from "next/server";
import { getWalletSession } from "../../../../lib/auth/session";
import { getVersusPositions } from "../../../../lib/db/versus-positions";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getWalletSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { id } = await params;
  if (!/^\d{1,78}$/.test(id)) return NextResponse.json({ error: "Invalid Versus id." }, { status: 400 });

  try {
    const result = await getVersusPositions(session.address, id);
    const response = NextResponse.json(result);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    console.error(`Unable to read positions for versus ${id}.`, error);
    return NextResponse.json({ error: "The positions service is temporarily unavailable." }, { status: 503 });
  }
}
