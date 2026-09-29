import "server-only";

import { cookies } from "next/headers";
import type { Address } from "viem";
import { getReferralOwnerByCode, type ReferralOwner } from "../db/referrals";
import { normalizeReferralCode, PENDING_REFERRAL_COOKIE_NAME } from "./constants";
import { REFERRAL_REGISTRY_ABI, REFERRAL_REGISTRY_ADDRESS } from "../contracts/korum";
import { getKorumServerPublicClient } from "../contracts/server-client";
import { canBindReferral } from "./eligibility";

export type PendingReferral = Pick<ReferralOwner, "referralCode" | "evmWallet"> & { walletAddress: Address };

export async function resolvePendingReferral(
  cookieValue: unknown,
  currentWallet: Address,
): Promise<PendingReferral | null> {
  const referralCode = normalizeReferralCode(cookieValue);
  if (!referralCode) return null;

  const owner = await getReferralOwnerByCode(referralCode);
  if (!owner || owner.evmWallet.toLowerCase() === currentWallet.toLowerCase()) return null;

  const client = getKorumServerPublicClient();
  const currentReferrer = await client.readContract({
    address: REFERRAL_REGISTRY_ADDRESS,
    abi: REFERRAL_REGISTRY_ABI,
    functionName: "referrerOf",
    args: [currentWallet],
  }) as Address;
  if (!canBindReferral(currentWallet, owner.evmWallet, currentReferrer)) return null;

  return {
    walletAddress: currentWallet,
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
