import { getAddress, isAddress } from "viem";
import { NextResponse, type NextRequest } from "next/server";
import { KORUM_CHAIN_ID } from "../../../config/korum-network";
import {
  CHALLENGE_COOKIE_NAME,
  challengeCookieOptions,
  createSignInMessage,
  createWalletChallenge,
  createWalletNonce,
  getRequestOrigin,
  isSameOriginRequest,
  readWalletNonce,
} from "../../../lib/auth/session";

export function GET(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const requestOrigin = getRequestOrigin(request);
  const domain = new URL(requestOrigin).host;
  const { nonce, token } = createWalletNonce(domain, requestOrigin);
  const response = new NextResponse(nonce.nonce, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
  response.cookies.set(CHALLENGE_COOKIE_NAME, token, challengeCookieOptions);
  return response;
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  try {
    const body = await request.json() as { nonce?: unknown; address?: unknown; chainId?: unknown };
    const nonce = readWalletNonce(request.cookies.get(CHALLENGE_COOKIE_NAME)?.value);
    if (!nonce || typeof body.nonce !== "string" || body.nonce !== nonce.nonce) {
      return NextResponse.json({ error: "The wallet nonce is invalid or expired." }, { status: 401 });
    }

    if (typeof body.address !== "string" || !isAddress(body.address)) {
      return NextResponse.json({ error: "Invalid wallet address." }, { status: 400 });
    }

    const chainId = Number(body.chainId);
    if (!Number.isInteger(chainId) || chainId !== KORUM_CHAIN_ID) {
      return NextResponse.json({ error: "Unsupported network." }, { status: 400 });
    }

    const requestOrigin = getRequestOrigin(request);
    if (nonce.uri !== requestOrigin || nonce.domain !== new URL(requestOrigin).host) {
      return NextResponse.json({ error: "The wallet nonce origin is invalid." }, { status: 401 });
    }

    const { challenge, token } = createWalletChallenge(getAddress(body.address), chainId, nonce);
    const response = NextResponse.json({ message: createSignInMessage(challenge) });
    response.cookies.set(CHALLENGE_COOKIE_NAME, token, challengeCookieOptions);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return NextResponse.json({ error: "Unable to create a sign-in challenge." }, { status: 400 });
  }
}
