import "server-only";
import { randomUUID } from "node:crypto";
import type Redis from "ioredis";
import { INDEXER_SCHEMA } from "../../config/deployment";
import { KORUM_CHAIN_ID } from "../../config/korum-network";
import { getDatabase } from "./client";
import { redisCacheKey } from "../cache/redis";
import { tokenRevisionKey } from "../live/chart-cache";

type Delivery = { eventId: string; version: string; tokens: string[]; needsReset: boolean };
const columns = 'event_id AS "eventId", version::TEXT, tokens, needs_reset AS "needsReset"';
export function pendingMarketDeliveries(eventIds: string[]): Promise<Delivery[]> {
  return getDatabase().unsafe<Delivery[]>(`
    SELECT ${columns} FROM ${INDEXER_SCHEMA}.market_delivery_outbox
    WHERE chain_id = $1 AND event_id = ANY($2::TEXT[])
  `, [KORUM_CHAIN_ID, eventIds]);
}
export async function acknowledgeMarketDeliveries(rows: Delivery[]) {
  if (!rows.length) return;
  // Never erase an insert/correction committed after the snapshot was read.
  await getDatabase().unsafe(`
    DELETE FROM ${INDEXER_SCHEMA}.market_delivery_outbox pending
    USING JSONB_TO_RECORDSET($2::TEXT::JSONB) AS sent("eventId" TEXT, version UUID)
    WHERE pending.chain_id = $1 AND pending.event_id = sent."eventId" AND pending.version = sent.version
  `, [KORUM_CHAIN_ID, JSON.stringify(rows.map(({ eventId, version }) => ({ eventId, version })))]);
}
const recoverScript = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[2], ARGV[2])
redis.call('SET', KEYS[3], ARGV[2])
for i = 5, #KEYS do redis.call('SET', KEYS[i], ARGV[2], 'EX', 86400) end
redis.call('PUBLISH', KEYS[4], ARGV[3])
return 1
`;

// Called only by the owner of the shared minute probe, not by each reader.
export async function recoverMarketDeliveries(redis: Redis, lease: string, owner: string) {
  const database = getDatabase();
  const pending = await database.unsafe<Delivery[]>(`
    SELECT ${columns} FROM ${INDEXER_SCHEMA}.market_delivery_outbox
    WHERE chain_id = $1 AND first_pending_at <= NOW() - INTERVAL '30 seconds'
    ORDER BY first_pending_at, event_id LIMIT 100
  `, [KORUM_CHAIN_ID]);
  if (!pending.length) return;
  await database.begin("isolation level repeatable read", async sql => {
    // Establish a SQL snapshot BEFORE invalidating Redis. Later commits are not
    // eligible for deletion; concurrent corrections abort this transaction.
    const rows = await sql.unsafe<Delivery[]>(`
      SELECT ${columns} FROM ${INDEXER_SCHEMA}.market_delivery_outbox
      WHERE chain_id = $1 AND first_pending_at <= NOW() - INTERVAL '30 seconds'
      ORDER BY first_pending_at, event_id LIMIT 100
    `, [KORUM_CHAIN_ID]);
    if (!rows.length) return;
    const tokens = [...new Set(rows.flatMap(row => row.tokens))];
    const revision = randomUUID();
    // Missing corrections/deletions may affect old creators/referrers whose
    // event mappings expired. Conservatively invalidate maintained sources,
    // while chart invalidation is limited to the journal's old and new tokens.
    const repaired = await redis.eval(recoverScript, 4 + tokens.length,
      lease, redisCacheKey("live", "revision"), redisCacheKey("live", "snapshot-metadata"),
      redisCacheKey("live", "markets"), ...tokens.map(token => tokenRevisionKey(redisCacheKey, token)),
      owner, revision, JSON.stringify({ revision, tokens, reset: true }));
    if (repaired === 1) {
      // One invalidation repairs all earlier events for these tokens, not only
      // 100 trades. A busy token cannot create an ever-growing recovery backlog.
      await sql.unsafe(`DELETE FROM ${INDEXER_SCHEMA}.market_delivery_outbox
        WHERE chain_id = $1 AND tokens <@ $2::TEXT[]`, [KORUM_CHAIN_ID, tokens]);
    }
  });
}
