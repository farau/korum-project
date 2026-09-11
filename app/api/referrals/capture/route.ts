import { NextResponse, type NextRequest } from "next/server";
import { getReferralOwnerByCode } from "../../../lib/db/referrals";
import {
  SESSION_COOKIE_NAME,
  getRequestOrigin,
  readWalletSession,
} from "../../../lib/auth/session";
import {
  normalizeReferralCode,
  PENDING_REFERRAL_COOKIE_NAME,
  pendingReferralCookieOptions,
  REFERRAL_NOTIFICATION_COOKIE_NAME,
  referralNotificationCookieOptions,
} from "../../../lib/referrals/constants";

function getSafeDestination(request: NextRequest) {
  const origin = getRequestOrigin(request);
  const fallback = new URL("/explore", origin);
  const returnTo = request.nextUrl.searchParams.get("returnTo");

  if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("//")) return fallback;

  try {
    const destination = new URL(returnTo, origin);
    return destination.origin === origin ? destination : fallback;
  } catch {
    return fallback;
  }
}

export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(getSafeDestination(request));
  response.headers.set("Cache-Control", "no-store");

  const referralCode = normalizeReferralCode(request.nextUrl.searchParams.get("code"));
  if (!referralCode) return response;

  try {
    const owner = await getReferralOwnerByCode(referralCode);
    if (!owner) return response;

    const session = readWalletSession(request.cookies.get(SESSION_COOKIE_NAME)?.value);
    if (session?.address.toLowerCase() === owner.evmWallet.toLowerCase()) return response;

    response.cookies.set(
      PENDING_REFERRAL_COOKIE_NAME,
      owner.referralCode,
      pendingReferralCookieOptions,
    );
    response.cookies.set(
      REFERRAL_NOTIFICATION_COOKIE_NAME,
      owner.referralCode,
      referralNotificationCookieOptions,
    );
  } catch (error) {
    console.error("Unable to capture the referral code.", error);
  }

  return response;
}
