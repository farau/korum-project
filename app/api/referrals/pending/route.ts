import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE_NAME,
  isSameOriginRequest,
  readWalletSession,
} from "../../../lib/auth/session";
import {
  PENDING_REFERRAL_COOKIE_NAME,
  pendingReferralCookieOptions,
} from "../../../lib/referrals/constants";
import { resolvePendingReferral } from "../../../lib/referrals/pending";

export async function GET(request: NextRequest) {
  const session = readWalletSession(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const cookieValue = request.cookies.get(PENDING_REFERRAL_COOKIE_NAME)?.value;
    const referral = await resolvePendingReferral(cookieValue, session.address);
    const response = NextResponse.json({
      walletAddress: session.address,
      referral: referral
        ? { code: referral.referralCode, referrerWallet: referral.evmWallet }
        : null,
    });

    if (cookieValue && !referral) {
      response.cookies.set(PENDING_REFERRAL_COOKIE_NAME, "", {
        ...pendingReferralCookieOptions,
        maxAge: 0,
      });
    }
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    console.error("Unable to resolve the pending referral.", error);
    return NextResponse.json({ error: "The referral service is temporarily unavailable." }, { status: 503 });
  }
}

export function DELETE(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const response = NextResponse.json({ referral: null });
  response.cookies.set(PENDING_REFERRAL_COOKIE_NAME, "", {
    ...pendingReferralCookieOptions,
    maxAge: 0,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
