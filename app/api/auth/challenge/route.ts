import { getAddress, isAddress } from "viem";
import { NextResponse } from "next/server";
import {
  CHALLENGE_COOKIE_NAME,
  challengeCookieOptions,
  createSignInMessage,
  createWalletChallenge,
  getRequestOrigin,
  isSameOriginRequest,
} from "../../../lib/auth/session";

const SUPPORTED_CHAIN_IDS = new Set([4663, 46630]);

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  try {
    const body = await request.json() as { address?: unknown; chainId?: unknown };
    if (typeof body.address !== "string" || !isAddress(body.address)) {
      return NextResponse.json({ error: "Invalid wallet address." }, { status: 400 });
    }

    const chainId = Number(body.chainId);
    if (!Number.isInteger(chainId) || !SUPPORTED_CHAIN_IDS.has(chainId)) {
      return NextResponse.json({ error: "Unsupported network." }, { status: 400 });
    }

    const requestOrigin = getRequestOrigin(request);
    const domain = new URL(requestOrigin).host;
    const { challenge, token } = createWalletChallenge(getAddress(body.address), chainId, domain, requestOrigin);
    const response = NextResponse.json({ message: createSignInMessage(challenge) });
    response.cookies.set(CHALLENGE_COOKIE_NAME, token, challengeCookieOptions);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return NextResponse.json({ error: "Unable to create a sign-in challenge." }, { status: 400 });
  }
}
