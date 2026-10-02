import "server-only";

import { INDEXER_SCHEMA } from "../../config/deployment";
import { KORUM_CHAIN_ID } from "../../config/korum-network";
import { redisCacheKey, rememberJson } from "../cache/redis";
import type { TokenVenue } from "../markets/venue";
import { getDatabase } from "./client";

export async function getTokenVenue(tokenAddress: string): Promise<TokenVenue | null> {
  if (!/^0x[\da-f]{40}$/i.test(tokenAddress)) return null;
  const token = tokenAddress.toLowerCase();
  return rememberJson(redisCacheKey("market", "venue-v1", token), 5, async () => {
    const rows = await getDatabase().unsafe<TokenVenue[]>(`
      SELECT camp.token_address AS "tokenAddress", camp.chain_id::INTEGER AS "chainId",
        market.curve_status::INTEGER AS "curveStatus", graduation.pool_id AS "poolId"
      FROM ${INDEXER_SCHEMA}.versus_camps camp
      JOIN ${INDEXER_SCHEMA}.camp_market_state market
        ON market.chain_id = camp.chain_id AND market.token_address = camp.token_address
      LEFT JOIN ${INDEXER_SCHEMA}.camp_graduations graduation
        ON graduation.chain_id = camp.chain_id AND graduation.token_address = camp.token_address
      WHERE camp.chain_id = $1 AND camp.token_address = $2
      LIMIT 1
    `, [KORUM_CHAIN_ID, token]);
    return rows[0] ?? null;
  });
}
