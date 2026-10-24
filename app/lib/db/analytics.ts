import "server-only";

import { INDEXER_SCHEMA } from "../../config/deployment";

import { redisCacheKey, rememberJson, type CacheDiagnostic } from "../cache/redis";
import { getEthUsdQuote } from "../markets/quote-usd";
import { unitsNumber } from "../markets/math";
import { KORUM_CHAIN_ID } from "../../config/korum-network";
import { getDatabase } from "./client";
import { analyticsWindow, annualBuckets, type AnalyticsPeriod, type AnalyticsSnapshot } from "../analytics";

export type { AnalyticsPeriod, AnalyticsSnapshot } from "../analytics";
export const ANALYTICS_CACHE_SECONDS = 10 * 60;

type AggregateRow = {
  category: string | null;
  isTotal: number;
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

async function loadAnalytics(period: AnalyticsPeriod, now: Date): Promise<AnalyticsSnapshot> {
  const database = getDatabase();
  const { startSeconds, endSeconds, bucketSeconds } = analyticsWindow(period, now);
  const bucketExpression = period === "year"
    ? "EXTRACT(EPOCH FROM (DATE_TRUNC('month', trade.traded_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'))"
    : "FLOOR(EXTRACT(EPOCH FROM trade.traded_at) / $4) * $4";
  const [aggregateRows, bucketRows, quote] = await Promise.all([
    database.unsafe<AggregateRow[]>(`
      SELECT
        COALESCE(versus.category, 'Other') AS category,
        GROUPING(versus.category)::INTEGER AS "isTotal",
        COUNT(*)::INTEGER AS trades,
        COALESCE(SUM(trade.eth_gross), 0)::TEXT AS "volumeEth",
        COALESCE(SUM(trade.fee_total), 0)::TEXT AS "feesEth",
        COALESCE(SUM(trade.fee_creator), 0)::TEXT AS "creatorFeesEth",
        COUNT(DISTINCT trade.trader_address)::INTEGER AS traders,
        COUNT(DISTINCT camp.versus_id)::INTEGER AS "activeVersus"
      FROM ${INDEXER_SCHEMA}.camp_trades trade
      JOIN ${INDEXER_SCHEMA}.versus_camps camp
        ON camp.chain_id = trade.chain_id
        AND camp.token_address = trade.token_address
      LEFT JOIN ${INDEXER_SCHEMA}.versuses versus
        ON versus.chain_id = camp.chain_id AND versus.versus_id = camp.versus_id
      WHERE trade.chain_id = $1
        AND trade.traded_at >= TO_TIMESTAMP($2::DOUBLE PRECISION)
        AND trade.traded_at < TO_TIMESTAMP($3::DOUBLE PRECISION)
      GROUP BY GROUPING SETS ((versus.category), ())
    `, [KORUM_CHAIN_ID, startSeconds, endSeconds]),
    database.unsafe<BucketRow[]>(`
      SELECT
        ${bucketExpression} AS timestamp,
        COALESCE(SUM(trade.eth_gross), 0)::TEXT AS "volumeEth",
        COUNT(*)::INTEGER AS trades
      FROM ${INDEXER_SCHEMA}.camp_trades trade
      WHERE trade.chain_id = $1
        AND trade.traded_at >= TO_TIMESTAMP($2::DOUBLE PRECISION)
        AND trade.traded_at < TO_TIMESTAMP($3::DOUBLE PRECISION)
      GROUP BY ${bucketExpression}
      ORDER BY timestamp ASC
    `, period === "year" ? [KORUM_CHAIN_ID, startSeconds, endSeconds] : [KORUM_CHAIN_ID, startSeconds, endSeconds, bucketSeconds]),
    getEthUsdQuote(),
  ]);

  const aggregate = aggregateRows.find(row => row.isTotal === 1);
  const trades = aggregate?.trades ?? 0;
  const volumeEth = unitsNumber(aggregate?.volumeEth ?? "0") ?? 0;
  const feesEth = unitsNumber(aggregate?.feesEth ?? "0") ?? 0;
  const creatorFeesEth = unitsNumber(aggregate?.creatorFeesEth ?? "0") ?? 0;
  const averageTradeEth = trades > 0 ? volumeEth / trades : 0;
  const toUsd = (value: number) => quote ? value * quote.value : null;
  const buckets = bucketRows.map((row) => {
    const volumeEthInBucket = unitsNumber(row.volumeEth) ?? 0;
    return { timestamp: Number(row.timestamp), volumeEth: volumeEthInBucket, volumeUsd: toUsd(volumeEthInBucket), trades: row.trades };
  });

  return {
    period,
    categories: aggregateRows.filter(row => row.isTotal === 0).map(row => {
      const volumeEth = unitsNumber(row.volumeEth) ?? 0;
      return { name: row.category ?? "Other", volumeEth, volumeUsd: toUsd(volumeEth) };
    }).sort((a, b) => b.volumeEth - a.volumeEth || a.name.localeCompare(b.name)),
    asOf: endSeconds,
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
    buckets: period === "year" ? annualBuckets(buckets, now, quote !== null) : buckets,
  };
}

export function getAnalytics(period: AnalyticsPeriod, diagnostic?: CacheDiagnostic) {
  const now = new Date();
  // A month/year rollover must never reuse the previous annual snapshot.
  const calendarScope = period === "year" ? [now.getUTCFullYear(), now.getUTCMonth() + 1] : [];
  return rememberJson(
    redisCacheKey("analytics", "snapshot-v3", period, ...calendarScope),
    ANALYTICS_CACHE_SECONDS,
    () => loadAnalytics(period, now),
    diagnostic,
  );
}
