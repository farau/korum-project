import "server-only";

import { cookies } from "next/headers";
import type { Address } from "viem";
import { getReferralOwnerByCode, type ReferralOwner } from "../db/referrals";
import { normalizeReferralCode, PENDING_REFERRAL_COOKIE_NAME } from "./constants";

export type PendingReferral = Pick<ReferralOwner, "referralCode" | "evmWallet">;

export async function resolvePendingReferral(
  cookieValue: unknown,
  currentWallet: Address,
): Promise<PendingReferral | null> {
  const referralCode = normalizeReferralCode(cookieValue);
  if (!referralCode) return null;

  const owner = await getReferralOwnerByCode(referralCode);
  if (!owner || owner.evmWallet.toLowerCase() === currentWallet.toLowerCase()) return null;

  return {
    referralCode: owner.referralCode,
    evmWallet: owner.evmWallet,
  };
}

export async function getPendingReferralForWallet(currentWallet: Address) {
  const cookieStore = await cookies();
  return resolvePendingReferral(
    cookieStore.get(PENDING_REFERRAL_COOKIE_NAME)?.value,
    currentWallet,
  );
}
