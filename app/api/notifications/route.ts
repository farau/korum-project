import { NextResponse, type NextRequest } from "next/server";
import { isSameOriginRequest } from "../../lib/auth/session";
import {
  normalizeReferralCode,
  REFERRAL_NOTIFICATION_COOKIE_NAME,
  referralNotificationCookieOptions,
} from "../../lib/referrals/constants";

function clearReferralNotification(response: NextResponse) {
  response.cookies.set(REFERRAL_NOTIFICATION_COOKIE_NAME, "", {
    ...referralNotificationCookieOptions,
    maxAge: 0,
  });
}

export function GET(request: NextRequest) {
  const cookieValue = request.cookies.get(REFERRAL_NOTIFICATION_COOKIE_NAME)?.value;
  const referralCode = normalizeReferralCode(cookieValue);
  const response = NextResponse.json({
    notification: referralCode
      ? {
          id: `referral-recorded:${referralCode}`,
          type: "referral",
          title: "Referral recorded",
          message: `Referral code ${referralCode} has been saved. It will be linked to your wallet on your first eligible transaction.`,
          createdAt: new Date().toISOString(),
        }
      : null,
  });

  if (cookieValue && !referralCode) clearReferralNotification(response);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export function DELETE(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const response = NextResponse.json({ notification: null });
  clearReferralNotification(response);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
