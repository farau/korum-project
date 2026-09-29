import type { PendingReferral } from "./pending";

export async function fetchPendingReferral(wallet: string, signal?: AbortSignal): Promise<PendingReferral | null> {
  try {
    const response = await fetch("/api/referrals/pending", { credentials: "same-origin", cache: "no-store", signal });
    if (!response.ok) return null;
    const result = await response.json() as {
      walletAddress?: string;
      referral?: { code: string; referrerWallet: `0x${string}` } | null;
    };
    if (result.walletAddress?.toLowerCase() !== wallet.toLowerCase() || !result.referral) return null;
    return { walletAddress: wallet as `0x${string}`, referralCode: result.referral.code, evmWallet: result.referral.referrerWallet };
  } catch {
    // A trade can continue without submitting an unverified referral.
    return null;
  }
}
