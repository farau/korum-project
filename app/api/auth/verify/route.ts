import { verifyMessage } from "viem";
import { NextResponse, type NextRequest } from "next/server";
import { upsertUserAfterWalletVerification } from "../../../lib/db/users";
import { getKorumServerPublicClient } from "../../../lib/contracts/server-client";
import { readAuthBody } from "../../../lib/auth/request-body";
import { consumeRateLimit, redisCacheKey } from "../../../lib/cache/redis";
import { requestIdentity } from "../../../lib/request-identity";
import {
  CHALLENGE_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  challengeCookieOptions,
  createSignInMessage,
  createWalletSession,
  getRequestOrigin,
  isSameOriginRequest,
  readWalletChallenge,
  sessionCookieOptions,
} from "../../../lib/auth/session";

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  try {
    const ipBudget = await consumeRateLimit(redisCacheKey("rate-limit", "wallet-verify", requestIdentity(request)), 1, 60, 60);
    if (!ipBudget.allowed) {
      return NextResponse.json({ error: "Too many sign-in attempts." }, {
        status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(ipBudget.retryAfterSeconds) },
      });
    }
    const body = await readAuthBody(request);
    if (typeof body.message !== "string" || body.message.length > 4096
      || typeof body.signature !== "string" || body.signature.length > 32770
      || !/^0x(?:[0-9a-fA-F]{2})+$/.test(body.signature)) {
      return NextResponse.json({ error: "Missing signature." }, { status: 400 });
    }

    const challenge = readWalletChallenge(request.cookies.get(CHALLENGE_COOKIE_NAME)?.value);
    if (!challenge || challenge.uri !== getRequestOrigin(request) || body.message !== createSignInMessage(challenge)) {
      return NextResponse.json({ error: "The sign-in challenge is invalid or expired." }, { status: 401 });
    }
    const nonceBudget = await consumeRateLimit(redisCacheKey("rate-limit", "wallet-challenge", challenge.nonce), 1, 10, 300);
    if (!nonceBudget.allowed) {
      return NextResponse.json({ error: "Too many attempts for this sign-in challenge." }, {
        status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(nonceBudget.retryAfterSeconds) },
      });
    }

    const validEoaSignature = await verifyMessage({
      address: challenge.address,
      message: body.message,
      signature: body.signature as `0x${string}`,
    }).catch(() => false);
    const valid = validEoaSignature || await getKorumServerPublicClient().verifyMessage({
      address: challenge.address,
      message: body.message,
      signature: body.signature as `0x${string}`,
    });

    if (!valid) {
      return NextResponse.json({ error: "The wallet signature is invalid." }, { status: 401 });
    }

    let user;
    try {
      user = await upsertUserAfterWalletVerification(challenge.address, challenge.chainId, challenge);
    } catch (error) {
      console.error("Unable to initialize the wallet user.", error);
      return NextResponse.json({ error: "The wallet profile service is temporarily unavailable." }, { status: 503 });
    }
    if (!user) {
      return NextResponse.json({ error: "The sign-in challenge was already used or has expired." }, { status: 401 });
    }

    const { session, token } = createWalletSession(user.id, challenge.address, challenge.chainId);
    const response = NextResponse.json({ authenticated: true, address: session.address });
    response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions);
    response.cookies.set(CHALLENGE_COOKIE_NAME, "", { ...challengeCookieOptions, maxAge: 0 });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    if (error instanceof RangeError) return NextResponse.json({ error: error.message }, { status: 413 });
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid authentication payload." }, { status: 400 });
    return NextResponse.json({ error: "Wallet authentication failed." }, { status: 401 });
  }
}
