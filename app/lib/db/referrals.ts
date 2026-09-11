import "server-only";

import type { Address } from "viem";
import { normalizeReferralCode } from "../referrals/constants";
import { getDatabase } from "./client";

export type ReferralOwner = {
  userId: string;
  referralCode: string;
  evmWallet: Address;
};

type ReferralOwnerRow = {
  userId: string;
  referralCode: string;
  evmWallet: string;
};

export async function getReferralOwnerByCode(value: unknown): Promise<ReferralOwner | null> {
  const referralCode = normalizeReferralCode(value);
  if (!referralCode) return null;

  const database = getDatabase();
  const rows = await database.unsafe<ReferralOwnerRow[]>(`
    SELECT
      id AS "userId",
      referral_code AS "referralCode",
      evm_wallet AS "evmWallet"
    FROM users
    WHERE referral_code = $1
    LIMIT 1
  `, [referralCode]);

  const owner = rows[0];
  return owner
    ? {
        userId: owner.userId,
        referralCode: owner.referralCode,
        evmWallet: owner.evmWallet as Address,
      }
    : null;
}
