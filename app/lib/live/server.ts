import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type Redis from "ioredis";
import { connectedRedis, redisCacheKey } from "../cache/redis";
import { INDEXER_SCHEMA } from "../../config/deployment";
import { getDatabase } from "../db/client";
import type { MarketNotice, TradeNotice } from "./protocol";

const channel = redisCacheKey("live", "markets");
export const marketRevisionKey = redisCacheKey("live", "revision");

// Never advertise a trade before the independent PostgreSQL sink commits it.
export async function projectionsReady(notices: TradeNotice[]) {
  const rows = await getDatabase().unsafe<{ eventId: string; blockHash: string; hasCamp: boolean }[]>(`
    SELECT trade.event_id AS "eventId", trade.block_hash AS "blockHash",
      EXISTS (SELECT 1 FROM ${INDEXER_SCHEMA}.versus_camps camp
        JOIN ${INDEXER_SCHEMA}.versuses versus USING (chain_id, versus_id)
        WHERE camp.chain_id = trade.chain_id AND camp.token_address = trade.token_address) AS "hasCamp"
    FROM ${INDEXER_SCHEMA}.camp_trades trade
    WHERE trade.chain_id = $1 AND trade.event_id = ANY($2::text[])
  `, [notices[0].chain_id, notices.map(row => row.event_id)]);
  const indexed = new Map(rows.map(row => [row.eventId, row]));
  return notices.every(notice => {
    const row = indexed.get(notice.event_id);
    return notice.operation === "d" ? !row || row.blockHash !== notice.block_hash
      : row?.blockHash === notice.block_hash && row.hasCamp;
  });
}

// Dedupe, cache version and broadcast form one atomic operation. Cache loads
// started before this operation cannot overwrite data for the new revision.
const publishScript = `
local changed = false
for i = 3, #KEYS do
  if redis.call('GET', KEYS[i]) ~= ARGV[i] then changed = true end
end
if not changed then return 0 end
for i = 3, #KEYS do redis.call('SET', KEYS[i], ARGV[i], 'EX', 86400) end
redis.call('SET', KEYS[1], ARGV[1])
redis.call('PUBLISH', KEYS[2], ARGV[2])
return 1
`;
export async function publishMarketNotice(notices: TradeNotice[]) {
  const redis = await connectedRedis();
  if (!redis || redis.status !== "ready") throw new Error("Live Redis unavailable");
  const notice: MarketNotice = {
    revision: randomUUID(), tokens: [...new Set(notices.map(row => row.token_address))],
    reset: notices.some(row => row.operation !== "i"),
  };
  const keys = notices.map(row => redisCacheKey("live", "event", createHash("sha256").update(row.event_id).digest("hex")));
  return redis.eval(publishScript, 2 + keys.length, marketRevisionKey, channel, ...keys,
    notice.revision, JSON.stringify(notice), ...notices.map(row => `${row.block_hash}:${row.operation}`));
}

type Listener = (notice: MarketNotice) => void;
type Hub = { listeners: Set<Listener>; subscriber?: Redis; connecting?: Promise<void> };
declare global { var __korumMarketHub: Hub | undefined }
function hub() { return globalThis.__korumMarketHub ??= { listeners: new Set() }; }
export async function subscribeMarkets(listener: Listener) {
  const state = hub();
  if (state.listeners.size >= 500) throw new Error("Live connection capacity reached");
  if (!state.subscriber) {
    state.connecting ??= (async () => {
      const redis = await connectedRedis();
      if (!redis || redis.status !== "ready") throw new Error("Live Redis unavailable");
      const subscriber = redis.duplicate({ lazyConnect: true });
      subscriber.on("error", () => undefined);
      subscriber.on("message", (_channel, message) => {
        try {
          const notice = JSON.parse(message) as MarketNotice;
          for (const callback of state.listeners) callback(notice);
        } catch { /* Only internal, authenticated publications are accepted. */ }
      });
      subscriber.on("ready", () => {
        // Redis Pub/Sub has no replay. Always reconcile after reconnection.
        for (const callback of state.listeners) callback({ revision: randomUUID(), tokens: [], reset: true });
      });
      try {
        await subscriber.connect();
        await subscriber.subscribe(channel);
        state.subscriber = subscriber;
      } catch (error) { subscriber.disconnect(); throw error; }
    })().finally(() => { state.connecting = undefined; });
    await state.connecting;
  }
  state.listeners.add(listener);
  return () => { state.listeners.delete(listener); };
}
