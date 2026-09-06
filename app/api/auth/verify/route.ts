import { verifyMessage } from "viem";
import { NextResponse, type NextRequest } from "next/server";
import { upsertUserAfterWalletVerification } from "../../../lib/db/users";
import {
  CHALLENGE_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  challengeCookieOptions,
  createSignInMessage,
  createWalletSession,
  isSameOriginRequest,
  readWalletChallenge,
  sessionCookieOptions,
} from "../../../lib/auth/session";

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  try {
    const body = await request.json() as { message?: unknown; signature?: unknown };
    if (typeof body.message !== "string" || typeof body.signature !== "string") {
      return NextResponse.json({ error: "Missing signature." }, { status: 400 });
    }

    const challenge = readWalletChallenge(request.cookies.get(CHALLENGE_COOKIE_NAME)?.value);
    if (!challenge || body.message !== createSignInMessage(challenge)) {
      return NextResponse.json({ error: "The sign-in challenge is invalid or expired." }, { status: 401 });
    }

    const valid = await verifyMessage({
      address: challenge.address,
      message: body.message,
      signature: body.signature as `0x${string}`,
    });

    if (!valid) {
      return NextResponse.json({ error: "The wallet signature is invalid." }, { status: 401 });
    }

    let user;
    try {
      user = await upsertUserAfterWalletVerification(challenge.address, challenge.chainId);
    } catch (error) {
      console.error("Unable to initialize the wallet user.", error);
      return NextResponse.json({ error: "The wallet profile service is temporarily unavailable." }, { status: 503 });
    }

    const { session, token } = createWalletSession(user.id, challenge.address, challenge.chainId);
    const response = NextResponse.json({ authenticated: true, address: session.address });
    response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions);
    response.cookies.set(CHALLENGE_COOKIE_NAME, "", { ...challengeCookieOptions, maxAge: 0 });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return NextResponse.json({ error: "Wallet authentication failed." }, { status: 401 });
  }
}
