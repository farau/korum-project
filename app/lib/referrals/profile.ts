import "server-only";

import { zeroAddress, type Address } from "viem";
import { REFERRAL_REGISTRY_ABI, REFERRAL_REGISTRY_ADDRESS } from "../contracts/korum";
import { getKorumServerPublicClient } from "../contracts/server-client";
import { getDatabase } from "../db/client";
import type { ProfileReferrer } from "../profile";

export async function getProfileReferrer(wallet: Address): Promise<ProfileReferrer> {
  try {
    const address = await getKorumServerPublicClient().readContract({
      address: REFERRAL_REGISTRY_ADDRESS,
      abi: REFERRAL_REGISTRY_ABI,
      functionName: "referrerOf",
      args: [wallet],
    }) as Address;
    if (address.toLowerCase() === zeroAddress) return { referrer: null, unavailable: false };
    const db = getDatabase();
    const [user] = await db<{ display_name: string | null }[]>`SELECT display_name FROM users WHERE evm_wallet = ${address.toLowerCase()}`;
    return { referrer: { address, displayName: user?.display_name ?? null }, unavailable: false };
  } catch (error) {
    console.error("Unable to read the confirmed profile referrer.", error);
    return { referrer: null, unavailable: true };
  }
}
