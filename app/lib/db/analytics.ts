import "server-only";

import { redisCacheKey, rememberJson, type CacheDiagnostic } from "../cache/redis";
import { getEthUsdQuote } from "../markets/quote-usd";
import { unitsNumber } from "../markets/math";
import { KORUM_CHAIN_ID } from "../../config/korum-network";
import { getDatabase } from "./client";

export type AnalyticsPeriod = "day" | "week" | "month";

export type AnalyticsSnapshot = {
  period: AnalyticsPeriod;
  trades: number;
  volumeEth: number;
  volumeUsd: number | null;
  averageTradeEth: number;
  averageTradeUsd: number | null;
  traders: number;
  activeVersus: number;
  feesEth: number;
  feesUsd: number | null;
  creatorFeesEth: number;
  creatorFeesUsd: number | null;
  buckets: Array<{
    timestamp: number;
    volumeEth: number;
    volumeUsd: number | null;
    trades: number;
  }>;
};

const PERIOD_CONFIG: Record<AnalyticsPeriod, { seconds: number; bucketSeconds: number }> = {
  day: { seconds: 24 * 60 * 60, bucketSeconds: 60 * 60 },
  week: { seconds: 7 * 24 * 60 * 60, bucketSeconds: 24 * 60 * 60 },
  month: { seconds: 30 * 24 * 60 * 60, bucketSeconds: 24 * 60 * 60 },
};
export const ANALYTICS_CACHE_SECONDS = 10 * 60;

type AggregateRow = {
  trades: number;
  volumeEth: string;
  feesEth: string;
  creatorFeesEth: string;
  traders: number;
  activeVersus: number;
};

type BucketRow = {
  timestamp: number | string;
  volumeEth: string;
  trades: number;
};

async function loadAnalytics(period: AnalyticsPeriod): Promise<AnalyticsSnapshot> {
  const database = getDatabase();
  const config = PERIOD_CONFIG[period];
  const startSeconds = Math.floor(Date.now() / 1_000) - config.seconds;
  const [aggregateRows, bucketRows, quote] = await Promise.all([
    database.unsafe<AggregateRow[]>(`
      SELECT
        COUNT(*)::INTEGER AS trades,
        COALESCE(SUM(trade.eth_gross), 0)::TEXT AS "volumeEth",
        COALESCE(SUM(trade.fee_total), 0)::TEXT AS "feesEth",
        COALESCE(SUM(trade.fee_creator), 0)::TEXT AS "creatorFeesEth",
        COUNT(DISTINCT trade.trader_address)::INTEGER AS traders,
        COUNT(DISTINCT camp.versus_id)::INTEGER AS "activeVersus"
      FROM indexer.camp_trades trade
      JOIN indexer.versus_camps camp
        ON camp.chain_id = trade.chain_id
        AND camp.token_address = trade.token_address
      WHERE trade.chain_id = $1
        AND trade.traded_at >= TO_TIMESTAMP($2::DOUBLE PRECISION)
    `, [KORUM_CHAIN_ID, startSeconds]),
    database.unsafe<BucketRow[]>(`
      SELECT
        FLOOR(EXTRACT(EPOCH FROM trade.traded_at) / $3) * $3 AS timestamp,
        COALESCE(SUM(trade.eth_gross), 0)::TEXT AS "volumeEth",
        COUNT(*)::INTEGER AS trades
      FROM indexer.camp_trades trade
      WHERE trade.chain_id = $1
        AND trade.traded_at >= TO_TIMESTAMP($2::DOUBLE PRECISION)
      GROUP BY FLOOR(EXTRACT(EPOCH FROM trade.traded_at) / $3)
      ORDER BY timestamp ASC
    `, [KORUM_CHAIN_ID, startSeconds, config.bucketSeconds]),
    getEthUsdQuote(),
  ]);

  const aggregate = aggregateRows[0];
  const trades = aggregate?.trades ?? 0;
  const volumeEth = unitsNumber(aggregate?.volumeEth ?? "0") ?? 0;
  const feesEth = unitsNumber(aggregate?.feesEth ?? "0") ?? 0;
  const creatorFeesEth = unitsNumber(aggregate?.creatorFeesEth ?? "0") ?? 0;
  const averageTradeEth = trades > 0 ? volumeEth / trades : 0;
  const toUsd = (value: number) => quote ? value * quote.value : null;

  return {
    period,
    trades,
    volumeEth,
    volumeUsd: toUsd(volumeEth),
    averageTradeEth,
    averageTradeUsd: toUsd(averageTradeEth),
    traders: aggregate?.traders ?? 0,
    activeVersus: aggregate?.activeVersus ?? 0,
    feesEth,
    feesUsd: toUsd(feesEth),
    creatorFeesEth,
    creatorFeesUsd: toUsd(creatorFeesEth),
    buckets: bucketRows.map((row) => {
      const volumeEthInBucket = unitsNumber(row.volumeEth) ?? 0;
      return {
        timestamp: Number(row.timestamp),
        volumeEth: volumeEthInBucket,
        volumeUsd: toUsd(volumeEthInBucket),
        trades: row.trades,
      };
    }),
  };
}

export function getAnalytics(period: AnalyticsPeriod, diagnostic?: CacheDiagnostic) {
  return rememberJson(
    redisCacheKey("analytics", "snapshot-v1", period),
    ANALYTICS_CACHE_SECONDS,
    () => loadAnalytics(period),
    diagnostic,
  );
}
