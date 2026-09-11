export const REFERRAL_CODE_LENGTH = 6;
export const REFERRAL_CODE_PATTERN = /^[A-Za-z0-9]{6}$/;
export const PENDING_REFERRAL_LIFETIME_SECONDS = 60 * 60 * 24 * 30;
export const REFERRAL_NOTIFICATION_LIFETIME_SECONDS = 60 * 10;

export const PENDING_REFERRAL_COOKIE_NAME = process.env.NODE_ENV === "production"
  ? "__Host-korum-referral"
  : "korum-referral";

export const REFERRAL_NOTIFICATION_COOKIE_NAME = process.env.NODE_ENV === "production"
  ? "__Host-korum-referral-notification"
  : "korum-referral-notification";

export const pendingReferralCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: PENDING_REFERRAL_LIFETIME_SECONDS,
  priority: "high" as const,
};

export const referralNotificationCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: REFERRAL_NOTIFICATION_LIFETIME_SECONDS,
  priority: "high" as const,
};

export function normalizeReferralCode(value: unknown) {
  if (typeof value !== "string") return null;
  const code = value.trim();
  return REFERRAL_CODE_PATTERN.test(code) ? code : null;
}
