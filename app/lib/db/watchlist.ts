import "server-only";

import { INDEXER_SCHEMA, WATCHLIST_TABLE } from "../../config/deployment";

import { getDatabase } from "./client";
import { randomUUID } from "node:crypto";
import { connectedRedis, redisCacheKey } from "../cache/redis";
import { readMaintained } from "../cache/maintained";

type WatchlistRow = {
  versusId: string;
};

async function readUserWatchlist(userId: string, chainId: number) {
  const database = getDatabase();
  const rows = await database.unsafe<WatchlistRow[]>(`
    SELECT versus_id AS "versusId"
    FROM ${WATCHLIST_TABLE}
    WHERE user_id = $1 AND chain_id = $2
    ORDER BY added_at DESC
  `, [userId, chainId]);

  return rows
    .map((row) => Number(row.versusId))
    .filter((versusId) => Number.isSafeInteger(versusId) && versusId >= 0);
}

function watchlistKeys(userId: string, chainId: number) {
  const value = redisCacheKey("private", "watchlist-ids-v1", chainId, userId);
  const revision = `${value}:revision`;
  return { value, revision, metadata: revision, guard: revision };
}

export async function getUserWatchlist(userId: string, chainId: number) {
  let redis;
  try { redis = await connectedRedis(); } catch { return readUserWatchlist(userId, chainId); }
  if (!redis || redis.status !== "ready") return readUserWatchlist(userId, chainId);
  return readMaintained(redis, watchlistKeys(userId, chainId), () => readUserWatchlist(userId, chainId));
}

async function invalidateWatchlist(userId: string, chainId: number) {
  const redis = await connectedRedis();
  if (!redis || redis.status !== "ready") return;
  const keys = watchlistKeys(userId, chainId);
  await redis.eval(`redis.call('SET', KEYS[1], ARGV[1], 'EX', 86400); redis.call('DEL', KEYS[2]); return 1`,
    2, keys.revision, keys.value, randomUUID());
}

export async function addUserWatchlistItem(userId: string, chainId: number, versusId: number) {
  const database = getDatabase();
  const rows = await database.unsafe<{ exists: boolean }[]>(`
    WITH indexed_versus AS (
      SELECT 1
      FROM ${INDEXER_SCHEMA}.versuses
      WHERE chain_id = $2 AND versus_id = $3
    ), inserted AS (
      INSERT INTO ${WATCHLIST_TABLE} (user_id, chain_id, versus_id)
      SELECT $1, $2, $3
      FROM indexed_versus
      ON CONFLICT (user_id, chain_id, versus_id) DO NOTHING
      RETURNING 1
    )
    SELECT EXISTS (SELECT 1 FROM indexed_versus) AS "exists"
  `, [userId, chainId, versusId]);

  const exists = rows[0]?.exists === true;
  if (exists) await invalidateWatchlist(userId, chainId);
  return exists;
}

export async function removeUserWatchlistItem(userId: string, chainId: number, versusId: number) {
  const database = getDatabase();
  await database.unsafe(`
    DELETE FROM ${WATCHLIST_TABLE}
    WHERE user_id = $1 AND chain_id = $2 AND versus_id = $3
  `, [userId, chainId, versusId]);
  await invalidateWatchlist(userId, chainId);
}
