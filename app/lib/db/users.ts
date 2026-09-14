import "server-only";

import { randomInt } from "node:crypto";
import { getAddress } from "viem";
import type { UserProfile } from "../profile";
import { getDatabase } from "./client";

type UserRow = {
  id: string;
  evmWallet: string;
  displayName: string | null;
  referralCode: string;
  profileBio: string | null;
  avatarObjectKey: string | null;
  avatarMimeType: string | null;
  avatarUpdatedAt: Date | null;
  xUserId: string | null;
  xUsername: string | null;
  xLinkedAt: Date | null;
  lastLoginChainId: string | null;
  lastLoginAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

function normalizeWallet(address: `0x${string}`) {
  return getAddress(address).toLowerCase() as `0x${string}`;
}

const referralAlphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const referralCodeLength = 6;
const referralCodeAttempts = 8;

function generateReferralCode() {
  return Array.from(
    { length: referralCodeLength },
    () => referralAlphabet[randomInt(referralAlphabet.length)],
  ).join("");
}

function isReferralCodeCollision(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const postgresError = error as { code?: string; constraint_name?: string };
  return postgresError.code === "23505"
    && postgresError.constraint_name === "users_referral_code_unique";
}

function toUserProfile(row: UserRow): UserProfile {
  return {
    id: row.id,
    evmWallet: row.evmWallet as `0x${string}`,
    displayName: row.displayName,
    referralCode: row.referralCode,
    bio: row.profileBio,
    avatar: row.avatarObjectKey && row.avatarMimeType && row.avatarUpdatedAt
      ? {
          objectKey: row.avatarObjectKey,
          mimeType: row.avatarMimeType,
          updatedAt: row.avatarUpdatedAt.toISOString(),
        }
      : null,
    xAccount: row.xUserId && row.xUsername && row.xLinkedAt
      ? {
          userId: row.xUserId,
          username: row.xUsername,
          linkedAt: row.xLinkedAt.toISOString(),
        }
      : null,
    lastLoginChainId: row.lastLoginChainId ? Number(row.lastLoginChainId) : null,
    lastLoginAt: row.lastLoginAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const userColumns = `
  id,
  evm_wallet AS "evmWallet",
  display_name AS "displayName",
  referral_code AS "referralCode",
  profile_bio AS "profileBio",
  avatar_object_key AS "avatarObjectKey",
  avatar_mime_type AS "avatarMimeType",
  avatar_updated_at AS "avatarUpdatedAt",
  x_user_id AS "xUserId",
  x_username AS "xUsername",
  x_linked_at AS "xLinkedAt",
  last_login_chain_id AS "lastLoginChainId",
  last_login_at AS "lastLoginAt",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

export async function upsertUserAfterWalletVerification(address: `0x${string}`, chainId: number) {
  const database = getDatabase();
  const evmWallet = normalizeWallet(address);

  for (let attempt = 0; attempt < referralCodeAttempts; attempt += 1) {
    try {
      const rows = await database.unsafe<UserRow[]>(`
        INSERT INTO users (evm_wallet, referral_code, last_login_chain_id, last_login_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (evm_wallet) DO UPDATE SET
          last_login_chain_id = EXCLUDED.last_login_chain_id,
          last_login_at = NOW(),
          updated_at = NOW()
        RETURNING ${userColumns}
      `, [evmWallet, generateReferralCode(), chainId]);

      if (!rows[0]) throw new Error("The wallet user upsert returned no row.");
      return toUserProfile(rows[0]);
    } catch (error) {
      if (!isReferralCodeCollision(error) || attempt === referralCodeAttempts - 1) throw error;
    }
  }

  throw new Error("Unable to allocate a unique referral code.");
}

export async function getUserForSession(userId: string, address: `0x${string}`) {
  const database = getDatabase();
  const evmWallet = normalizeWallet(address);
  const rows = await database.unsafe<UserRow[]>(`
    SELECT ${userColumns}
    FROM users
    WHERE id = $1 AND evm_wallet = $2
    LIMIT 1
  `, [userId, evmWallet]);

  return rows[0] ? toUserProfile(rows[0]) : null;
}

export async function updateUserBio(userId: string, address: `0x${string}`, bio: string | null) {
  const database = getDatabase();
  const evmWallet = normalizeWallet(address);
  const rows = await database.unsafe<UserRow[]>(`
    UPDATE users
    SET profile_bio = $3, updated_at = NOW()
    WHERE id = $1 AND evm_wallet = $2
    RETURNING ${userColumns}
  `, [userId, evmWallet, bio]);

  return rows[0] ? toUserProfile(rows[0]) : null;
}

export async function updateUserDisplayName(userId: string, address: `0x${string}`, displayName: string | null) {
  const database = getDatabase();
  const evmWallet = normalizeWallet(address);
  const rows = await database.unsafe<UserRow[]>(`
    UPDATE users
    SET display_name = $3, updated_at = NOW()
    WHERE id = $1 AND evm_wallet = $2
    RETURNING ${userColumns}
  `, [userId, evmWallet, displayName]);

  return rows[0] ? toUserProfile(rows[0]) : null;
}
