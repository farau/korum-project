import "server-only";

import { getDatabase } from "./client";

type WatchlistRow = {
  versusId: string;
};

export async function getUserWatchlist(userId: string, chainId: number) {
  const database = getDatabase();
  const rows = await database.unsafe<WatchlistRow[]>(`
    SELECT versus_id AS "versusId"
    FROM user_watchlist
    WHERE user_id = $1 AND chain_id = $2
    ORDER BY added_at DESC
  `, [userId, chainId]);

  return rows
    .map((row) => Number(row.versusId))
    .filter((versusId) => Number.isSafeInteger(versusId) && versusId >= 0);
}

export async function addUserWatchlistItem(userId: string, chainId: number, versusId: number) {
  const database = getDatabase();
  const rows = await database.unsafe<{ exists: boolean }[]>(`
    WITH indexed_versus AS (
      SELECT 1
      FROM indexer.versuses
      WHERE chain_id = $2 AND versus_id = $3
    ), inserted AS (
      INSERT INTO user_watchlist (user_id, chain_id, versus_id)
      SELECT $1, $2, $3
      FROM indexed_versus
      ON CONFLICT (user_id, chain_id, versus_id) DO NOTHING
      RETURNING 1
    )
    SELECT EXISTS (SELECT 1 FROM indexed_versus) AS "exists"
  `, [userId, chainId, versusId]);

  return rows[0]?.exists === true;
}

export async function removeUserWatchlistItem(userId: string, chainId: number, versusId: number) {
  const database = getDatabase();
  await database.unsafe(`
    DELETE FROM user_watchlist
    WHERE user_id = $1 AND chain_id = $2 AND versus_id = $3
  `, [userId, chainId, versusId]);
}
