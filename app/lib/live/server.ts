import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type Redis from "ioredis";
import { connectedRedis, redisCacheKey } from "../cache/redis";
import { INDEXER_SCHEMA } from "../../config/deployment";
import { getDatabase } from "../db/client";
import { tokenPriceWad, unitsNumber } from "../markets/math";
import { prepareChartMutations, publishChartScript } from "./chart-cache";
import type { ChartTrade } from "./chart";
import type { MarketNotice, TradeNotice } from "./protocol";
import { usesKorumCandles } from "../markets/venue";
import { prepareDebateMutations } from "./debate-cache";
import { loadIndexedDebateRowsByIds } from "../db/debates";
import { prepareProfileInvalidations } from "./profile-cache";

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

// One bounded read per webhook batch, shared by all subscribers and resolutions.
// The predecessor lets clients detect missing/out-of-order deliveries.
async function readChartTrades(notices: TradeNotice[]): Promise<{ trades: ChartTrade[]; disabledTokens: string[] }> {
  const rows = await getDatabase().unsafe<{
    eventId: string; blockHash: string; token: string; block: string; log: number; timestamp: string;
    previousBlock: string | null; previousLog: number | null;
    sqrtPrice: string; supply: string; volume: string; curveStatus: number; venue: number;
  }[]>(`
    SELECT trade.event_id AS "eventId", trade.block_hash AS "blockHash",
      trade.token_address AS token, trade.block_number::TEXT AS block,
      market.curve_status::INTEGER AS "curveStatus", trade.venue,
      trade.log_index AS log, FLOOR(EXTRACT(EPOCH FROM trade.traded_at))::TEXT AS timestamp,
      previous.block_number::TEXT AS "previousBlock", previous.log_index AS "previousLog",
      trade.sqrt_price_x96_after::TEXT AS "sqrtPrice", trade.eth_gross::TEXT AS volume,
      (CASE WHEN trade.venue = 1 AND graduation.token_residual IS NOT NULL
        THEN camp.total_supply - graduation.token_residual
        ELSE camp.total_supply - trade.token_reserve_after END)::TEXT AS supply
    FROM ${INDEXER_SCHEMA}.camp_trades trade
    JOIN ${INDEXER_SCHEMA}.versus_camps camp
      ON camp.chain_id = trade.chain_id AND camp.token_address = trade.token_address
    JOIN ${INDEXER_SCHEMA}.camp_market_state market
      ON market.chain_id = trade.chain_id AND market.token_address = trade.token_address
    LEFT JOIN ${INDEXER_SCHEMA}.camp_graduations graduation
      ON graduation.chain_id = trade.chain_id AND graduation.token_address = trade.token_address
    LEFT JOIN LATERAL (
      SELECT block_number, log_index FROM ${INDEXER_SCHEMA}.camp_trades candidate
      WHERE candidate.chain_id = trade.chain_id AND candidate.token_address = trade.token_address
        AND trade.venue = 0 AND market.curve_status = 1
        AND (candidate.block_number, candidate.log_index) < (trade.block_number, trade.log_index)
      ORDER BY candidate.block_number DESC, candidate.log_index DESC LIMIT 1
    ) previous ON true
    WHERE trade.chain_id = $1 AND trade.event_id = ANY($2::text[])
    ORDER BY trade.block_number, trade.log_index
  `, [notices[0].chain_id, notices.map(row => row.event_id)]);
  if (rows.length !== notices.length) throw new Error("Live projection changed while loading");
  const expected = new Map(notices.map(notice => [notice.event_id, notice.block_hash]));
  const disabledTokens: string[] = [];
  const trades = rows.flatMap(row => {
    if (expected.get(row.eventId) !== row.blockHash) throw new Error("Live projection hash changed");
    if (row.venue === 1 || !usesKorumCandles(row.curveStatus)) {
      disabledTokens.push(row.token);
      return [];
    }
    const price = unitsNumber(tokenPriceWad(row.sqrtPrice));
    const supply = unitsNumber(row.supply);
    const volumeQuote = unitsNumber(row.volume);
    if (price === null || supply === null || volumeQuote === null) throw new Error("Invalid live market values");
    return [{
      token: row.token, cursor: { block: Number(row.block), log: row.log },
      previous: row.previousBlock === null ? null : { block: Number(row.previousBlock), log: row.previousLog! },
      timestamp: Number(row.timestamp), price, marketCap: price * supply, volumeQuote,
    }];
  });
  return { trades, disabledTokens: [...new Set(disabledTokens)] };
}

async function readAffectedProfileWallets(notices: TradeNotice[]) {
  const rows = await getDatabase().unsafe<{
    eventId: string; blockHash: string; trader: string; creator: string; referrer: string | null;
  }[]>(`
    SELECT trade.event_id AS "eventId", trade.block_hash AS "blockHash",
      trade.trader_address AS trader, versus.creator_wallet AS creator,
      binding.referrer_wallet AS referrer
    FROM ${INDEXER_SCHEMA}.camp_trades trade
    JOIN ${INDEXER_SCHEMA}.versus_camps camp
      ON camp.chain_id = trade.chain_id AND camp.token_address = trade.token_address
    JOIN ${INDEXER_SCHEMA}.versuses versus
      ON versus.chain_id = camp.chain_id AND versus.versus_id = camp.versus_id
    LEFT JOIN ${INDEXER_SCHEMA}.referral_bindings binding
      ON binding.chain_id = trade.chain_id AND binding.user_wallet = trade.trader_address
    WHERE trade.chain_id = $1 AND trade.event_id = ANY($2::text[])
  `, [notices[0].chain_id, notices.map(notice => notice.event_id)]);
  const expected = new Map(notices.map(notice => [notice.event_id, notice.block_hash]));
  if (rows.length !== notices.length || rows.some(row => expected.get(row.eventId) !== row.blockHash)) {
    throw new Error("Profile projection changed while loading");
  }
  return rows.map(row => ({ eventId: row.eventId, wallets: [row.trader, row.creator, row.referrer]
    .filter((wallet): wallet is string => Boolean(wallet)) }));
}

export async function publishMarketNotice(notices: TradeNotice[]) {
  const redis = await connectedRedis();
  if (!redis || redis.status !== "ready") throw new Error("Live Redis unavailable");
  const keys = notices.map(row => redisCacheKey("live", "event", createHash("sha256").update(row.event_id).digest("hex")));
  const signatures = notices.map(row => `${row.block_hash}:${row.operation}`);
  const delivered = await redis.mget(...keys);
  if (delivered.every((signature, index) => signature === signatures[index])) return 0;
  const reset = notices.some(row => row.operation !== "i");
  const chartUpdates = reset ? undefined : await readChartTrades(notices);
  const trades = chartUpdates?.trades;
  const notice: MarketNotice = {
    revision: randomUUID(), tokens: [...new Set(notices.map(row => row.token_address))],
    reset, trades,
  };
  for (let attempt = 0; attempt < 8; attempt++) {
    const previous = await redis.get(marketRevisionKey) ?? "0";
    const { mutations, revisions } = await prepareChartMutations(redis, redisCacheKey, notice.tokens, notice.revision, trades ?? [], reset, chartUpdates?.disabledTokens);
    const snapshots = await prepareDebateMutations(redis, redisCacheKey, notice.tokens, notice.revision, loadIndexedDebateRowsByIds);
    const profiles = await prepareProfileInvalidations(redis, redisCacheKey, notices, readAffectedProfileWallets);
    const published = await redis.eval(publishChartScript, 2 + keys.length, marketRevisionKey, channel, ...keys,
      notice.revision, JSON.stringify(notice), previous, notices.length,
      ...signatures, JSON.stringify([...revisions, ...snapshots.revisions, ...profiles.revisions]),
      JSON.stringify([...mutations, ...snapshots.mutations]), JSON.stringify([...snapshots.mappings, ...profiles.mappings]));
    if (published !== -1) return published;
  }
  throw new Error("Concurrent live publications; retry the batch");
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
