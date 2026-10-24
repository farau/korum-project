import { NextResponse } from "next/server";

import { KORUM_CHAIN_ID } from "../../config/korum-network";
import { getWalletSession, isSameOriginRequest } from "../../lib/auth/session";
import {
  addUserWatchlistItem,
  getUserWatchlist,
  removeUserWatchlistItem,
} from "../../lib/db/watchlist";
import { getIndexedWatchlistDebates } from "../../lib/db/debates";

function unauthorized() {
  return NextResponse.json({ error: "Authentication required." }, { status: 401 });
}

function walletChanged(request: Request, address: string) {
  const expected = request.headers.get("X-Korum-Wallet");
  return expected && expected.toLowerCase() !== address.toLowerCase()
    ? NextResponse.json({ error: "The wallet session changed. Please reconnect." }, { status: 409 }) : null;
}

async function versusIdFromRequest(request: Request) {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") return null;
    const versusId = (body as { versusId?: unknown }).versusId;
    return Number.isSafeInteger(versusId) && Number(versusId) >= 0 ? Number(versusId) : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const session = await getWalletSession();
  if (!session) return unauthorized();
  const mismatch = walletChanged(request, session.address);
  if (mismatch) return mismatch;

  try {
    const ids = await getUserWatchlist(session.userId, KORUM_CHAIN_ID);
    if (new URL(request.url).searchParams.get("view") === "ids") {
      return NextResponse.json({ ids }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const debates = await getIndexedWatchlistDebates(session.userId, ids);
    return NextResponse.json({ ids, debates }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Unable to read the user watchlist.", error);
    return NextResponse.json({ error: "The watchlist is temporarily unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const session = await getWalletSession();
  if (!session) return unauthorized();
  const mismatch = walletChanged(request, session.address);
  if (mismatch) return mismatch;
  const versusId = await versusIdFromRequest(request);
  if (versusId === null) return NextResponse.json({ error: "A valid Versus ID is required." }, { status: 400 });

  try {
    const exists = await addUserWatchlistItem(session.userId, KORUM_CHAIN_ID, versusId);
    if (!exists) return NextResponse.json({ error: "Versus not found." }, { status: 404 });
    return NextResponse.json({ added: true, versusId }, { status: 201 });
  } catch (error) {
    console.error("Unable to add the watchlist item.", error);
    return NextResponse.json({ error: "The watchlist is temporarily unavailable." }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const session = await getWalletSession();
  if (!session) return unauthorized();
  const mismatch = walletChanged(request, session.address);
  if (mismatch) return mismatch;
  const versusId = await versusIdFromRequest(request);
  if (versusId === null) return NextResponse.json({ error: "A valid Versus ID is required." }, { status: 400 });

  try {
    await removeUserWatchlistItem(session.userId, KORUM_CHAIN_ID, versusId);
    return NextResponse.json({ removed: true, versusId });
  } catch (error) {
    console.error("Unable to remove the watchlist item.", error);
    return NextResponse.json({ error: "The watchlist is temporarily unavailable." }, { status: 503 });
  }
}
