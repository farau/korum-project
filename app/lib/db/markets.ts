import "server-only";

import { INDEXER_SCHEMA } from "../../config/deployment";

import { KORUM_CHAIN_ID } from "../../config/korum-network";
import { redisCacheKey, rememberJson, type CacheDiagnostic } from "../cache/redis";
import { getEthUsdQuote } from "../markets/quote-usd";
import { tokenPriceWad, unitsNumber } from "../markets/math";
import { getDatabase } from "./client";

const TOKEN_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export type MarketRange = "1m" | "5m" | "15m" | "1h" | "4h" | "1d" | "7d" | "30d" | "180d" | "all";

const RANGE_CONFIG: Record<MarketRange, { intervalSeconds: number; cacheSeconds: number }> = {
  "1m": { intervalSeconds: 60, cacheSeconds: 2 },
  "5m": { intervalSeconds: 5 * 60, cacheSeconds: 2 },
  "15m": { intervalSeconds: 15 * 60, cacheSeconds: 2 },
  "1h": { intervalSeconds: 60 * 60, cacheSeconds: 2 },
  "4h": { intervalSeconds: 4 * 60 * 60, cacheSeconds: 2 },
  "1d": { intervalSeconds: 24 * 60 * 60, cacheSeconds: 2 },
  "7d": { intervalSeconds: 7 * 24 * 60 * 60, cacheSeconds: 2 },
  "30d": { intervalSeconds: 30 * 24 * 60 * 60, cacheSeconds: 2 },
  "180d": { intervalSeconds: 180 * 24 * 60 * 60, cacheSeconds: 2 },
  "all": { intervalSeconds: 24 * 60 * 60, cacheSeconds: 2 },
};

export const TOKEN_TRADES_CACHE_SECONDS = 5;
export const RECENT_MARKET_TRADES_CACHE_SECONDS = 5;

type ChartRow = {
  timestamp: number | string;
  openSqrtPriceX96: string;
  minSqrtPriceX96: string;
  maxSqrtPriceX96: string;
  closeSqrtPriceX96: string;
  openCirculatingSupply: string;
  highCirculatingSupply: string;
  lowCirculatingSupply: string;
  closeCirculatingSupply: string;
  highMarketCap: string;
  lowMarketCap: string;
  blockNumber: number | string;
  lastTradeAt: number | string;
  volumeQuote: string;
  tradeCount: number;
};

type PriorChartRow = {
  sqrtPriceX96: string;
  circulatingSupply: string;
  firstSqrtPriceX96: string | null;
  firstCirculatingSupply: string | null;
  previousSqrtPriceX96: string | null;
  previousCirculatingSupply: string | null;
  blockNumber: number | string;
  timestamp: number | string;
};

type TradeRow = {
  chainId: number | string;
  venue: number;
  emitterAddress: string | null;
  poolId: string | null;
  isBuy: boolean;
  tokenAmount: string;
  quoteAmount: string;
  account: string;
  transactionHash: string;
  blockNumber: number | string;
  logIndex: number;
  timestamp: number | string;
};

type RecentTradeRow = TradeRow & {
  versusId: string;
  tokenName: string;
  tokenSymbol: string;
};

function formatBaseUnits(value: string, decimals = 18) {
  if (!/^\d+$/.test(value)) return value;
  const padded = value.padStart(decimals + 1, "0");
  const integer = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${integer}.${fraction}` : integer;
}

function marketCap(price: number | null, circulatingSupply: string) {
  const supply = unitsNumber(circulatingSupply);
  return price === null || supply === null ? null : price * supply;
}

export function isMarketRange(value: string | null): value is MarketRange {
  return value !== null && value in RANGE_CONFIG;
}

export function normalizeTokenAddress(value: string) {
  return TOKEN_ADDRESS.test(value) ? value.toLowerCase() : null;
}

export function tokenChartCacheSeconds(range: MarketRange) {
  return RANGE_CONFIG[range].cacheSeconds;
}

export async function getTokenChart(tokenAddress: string, range: MarketRange, limit = 300, before?: number, diagnostic?: CacheDiagnostic) {
  const token = normalizeTokenAddress(tokenAddress);
  if (!token) return null;

  const config = RANGE_CONFIG[range];
  const safeLimit = Math.min(500, Math.max(1, Math.trunc(limit)));
  const interval = config.intervalSeconds;
  const nowSeconds = Math.floor(Date.now() / 1_000);
  const latestBucket = Math.floor(nowSeconds / interval) * interval;
  const endBucket = before === undefined ? latestBucket : Math.min(latestBucket, Math.floor(before / interval) * interval - interval);
  const startSeconds = Math.max(0, endBucket - (safeLimit - 1) * interval);
  const endExclusive = endBucket + interval;
  return rememberJson(
    redisCacheKey("market", "chart-v5", token, range, startSeconds, endExclusive),
    before === undefined ? config.cacheSeconds : 30,
    async () => {
      const database = getDatabase();
      const [rows, quote] = await Promise.all([
        database.unsafe<ChartRow[]>(`
          WITH enriched AS (
            SELECT trade.*,
              CASE
                WHEN trade.venue = 1 AND graduation.token_residual IS NOT NULL
                  THEN camp.total_supply - graduation.token_residual
                ELSE camp.total_supply - trade.token_reserve_after
              END AS circulating_supply
            FROM ${INDEXER_SCHEMA}.camp_trades trade
            JOIN ${INDEXER_SCHEMA}.versus_camps camp
              ON camp.chain_id = trade.chain_id AND camp.token_address = trade.token_address
            LEFT JOIN ${INDEXER_SCHEMA}.camp_graduations graduation
              ON graduation.chain_id = trade.chain_id AND graduation.token_address = trade.token_address
            WHERE trade.chain_id = $1
              AND trade.token_address = $2
              AND trade.traded_at >= TO_TIMESTAMP($4::DOUBLE PRECISION)
              AND trade.traded_at < TO_TIMESTAMP($5::DOUBLE PRECISION)
          )
          SELECT
            FLOOR(EXTRACT(EPOCH FROM traded_at) / $3) * $3 AS "timestamp",
            (ARRAY_AGG(sqrt_price_x96_after::TEXT ORDER BY block_number ASC, log_index ASC))[1] AS "openSqrtPriceX96",
            MIN(sqrt_price_x96_after)::TEXT AS "minSqrtPriceX96",
            MAX(sqrt_price_x96_after)::TEXT AS "maxSqrtPriceX96",
            (ARRAY_AGG(sqrt_price_x96_after::TEXT ORDER BY block_number DESC, log_index DESC))[1] AS "closeSqrtPriceX96",
            (ARRAY_AGG(circulating_supply::TEXT ORDER BY block_number ASC, log_index ASC))[1] AS "openCirculatingSupply",
            (ARRAY_AGG(circulating_supply::TEXT ORDER BY sqrt_price_x96_after ASC, block_number ASC, log_index ASC))[1] AS "highCirculatingSupply",
            (ARRAY_AGG(circulating_supply::TEXT ORDER BY sqrt_price_x96_after DESC, block_number ASC, log_index ASC))[1] AS "lowCirculatingSupply",
            (ARRAY_AGG(circulating_supply::TEXT ORDER BY block_number DESC, log_index DESC))[1] AS "closeCirculatingSupply",
            MAX(POWER(2::NUMERIC, 192) / NULLIF(sqrt_price_x96_after::NUMERIC * sqrt_price_x96_after::NUMERIC, 0) * circulating_supply::NUMERIC / POWER(10::NUMERIC, 18))::TEXT AS "highMarketCap",
            MIN(POWER(2::NUMERIC, 192) / NULLIF(sqrt_price_x96_after::NUMERIC * sqrt_price_x96_after::NUMERIC, 0) * circulating_supply::NUMERIC / POWER(10::NUMERIC, 18))::TEXT AS "lowMarketCap",
            MAX(block_number) AS "blockNumber",
            MAX(EXTRACT(EPOCH FROM traded_at)) AS "lastTradeAt",
            SUM(eth_gross)::TEXT AS "volumeQuote",
            COUNT(*)::INTEGER AS "tradeCount"
          FROM enriched
          GROUP BY FLOOR(EXTRACT(EPOCH FROM traded_at) / $3)
          ORDER BY "timestamp" ASC
        `, [KORUM_CHAIN_ID, token, interval, startSeconds, endExclusive]),
        getEthUsdQuote(),
      ]);

      const priorRows = await database.unsafe<PriorChartRow[]>(`
        SELECT trade.sqrt_price_x96_after::TEXT AS "sqrtPriceX96",
          CASE
            WHEN trade.venue = 1 AND graduation.token_residual IS NOT NULL
              THEN camp.total_supply - graduation.token_residual
            ELSE camp.total_supply - trade.token_reserve_after
          END::TEXT AS "circulatingSupply",
          first_trade.sqrt_price_x96_after::TEXT AS "firstSqrtPriceX96",
          CASE
            WHEN first_trade.venue = 1 AND graduation.token_residual IS NOT NULL
              THEN camp.total_supply - graduation.token_residual
            ELSE camp.total_supply - first_trade.token_reserve_after
          END::TEXT AS "firstCirculatingSupply",
          previous_trade.sqrt_price_x96_after::TEXT AS "previousSqrtPriceX96",
          CASE
            WHEN previous_trade.venue = 1 AND graduation.token_residual IS NOT NULL
              THEN camp.total_supply - graduation.token_residual
            ELSE camp.total_supply - previous_trade.token_reserve_after
          END::TEXT AS "previousCirculatingSupply",
          trade.block_number AS "blockNumber",
          EXTRACT(EPOCH FROM trade.traded_at)::BIGINT AS "timestamp"
        FROM (
          SELECT *
          FROM ${INDEXER_SCHEMA}.camp_trades
          WHERE chain_id = $1 AND token_address = $2
            AND traded_at < TO_TIMESTAMP($3::DOUBLE PRECISION)
          ORDER BY block_number DESC, log_index DESC
          LIMIT 1
        ) trade
        JOIN ${INDEXER_SCHEMA}.versus_camps camp
          ON camp.chain_id = trade.chain_id AND camp.token_address = trade.token_address
        LEFT JOIN ${INDEXER_SCHEMA}.camp_graduations graduation
          ON graduation.chain_id = trade.chain_id AND graduation.token_address = trade.token_address
        LEFT JOIN LATERAL (
          SELECT candidate.*
          FROM ${INDEXER_SCHEMA}.camp_trades candidate
          WHERE candidate.chain_id = trade.chain_id
            AND candidate.token_address = trade.token_address
            AND candidate.traded_at >= TO_TIMESTAMP(FLOOR(EXTRACT(EPOCH FROM trade.traded_at) / $4) * $4)
            AND candidate.traded_at < TO_TIMESTAMP((FLOOR(EXTRACT(EPOCH FROM trade.traded_at) / $4) + 1) * $4)
          ORDER BY candidate.block_number ASC, candidate.log_index ASC
          LIMIT 1
        ) first_trade ON true
        LEFT JOIN LATERAL (
          SELECT candidate.*
          FROM ${INDEXER_SCHEMA}.camp_trades candidate
          WHERE candidate.chain_id = trade.chain_id
            AND candidate.token_address = trade.token_address
            AND candidate.traded_at < TO_TIMESTAMP(FLOOR(EXTRACT(EPOCH FROM trade.traded_at) / $4) * $4)
          ORDER BY candidate.block_number DESC, candidate.log_index DESC
          LIMIT 1
        ) previous_trade ON true
      `, [KORUM_CHAIN_ID, token, startSeconds, interval]);

      const candles = new Map<number, {
        t: number;
        open: number;
        high: number;
        low: number;
        close: number;
        price: number;
        openMarketCap: number;
        highMarketCap: number;
        lowMarketCap: number;
        closeMarketCap: number;
        marketCap: number;
        blockNumber: number;
        volumeQuote: number;
        tradeCount: number;
        synthetic: false;
      }>();

      rows.forEach((row) => {
        const open = unitsNumber(tokenPriceWad(row.openSqrtPriceX96));
        const high = unitsNumber(tokenPriceWad(row.minSqrtPriceX96));
        const low = unitsNumber(tokenPriceWad(row.maxSqrtPriceX96));
        const close = unitsNumber(tokenPriceWad(row.closeSqrtPriceX96));
        const openMarketCap = marketCap(open, row.openCirculatingSupply);
        const highMarketCap = Number(row.highMarketCap);
        const lowMarketCap = Number(row.lowMarketCap);
        const closeMarketCap = marketCap(close, row.closeCirculatingSupply);
        const volumeQuote = unitsNumber(row.volumeQuote);
        if (open === null || high === null || low === null || close === null || openMarketCap === null || !Number.isFinite(highMarketCap) || !Number.isFinite(lowMarketCap) || closeMarketCap === null || volumeQuote === null) return;
        const timestamp = Number(row.timestamp);
        candles.set(timestamp, {
          t: timestamp,
          open,
          high,
          low,
          close,
          price: close,
          openMarketCap,
          highMarketCap,
          lowMarketCap,
          closeMarketCap,
          marketCap: closeMarketCap,
          blockNumber: Number(row.blockNumber),
          volumeQuote,
          tradeCount: row.tradeCount,
          synthetic: false,
        });
      });

      const prior = priorRows[0];
      const priorPrice = prior
        ? unitsNumber(tokenPriceWad(prior.sqrtPriceX96))
        : null;
      const priorMarketCap = prior ? marketCap(priorPrice, prior.circulatingSupply) : null;
      const priorOpenPrice = prior
        ? unitsNumber(tokenPriceWad(prior.previousSqrtPriceX96 ?? prior.firstSqrtPriceX96))
        : null;
      const priorOpenMarketCap = prior
        ? marketCap(priorOpenPrice, prior.previousCirculatingSupply ?? prior.firstCirculatingSupply ?? "")
        : null;
      const priorPriceUp = priorPrice === null || priorOpenPrice === null ? null : priorPrice >= priorOpenPrice;
      const priorMarketCapUp = priorMarketCap === null || priorOpenMarketCap === null ? null : priorMarketCap >= priorOpenMarketCap;
      let previousClose = priorPrice;
      let previousMarketCap = priorMarketCap;
      const points = [] as Array<{
        t: number;
        open: number;
        high: number;
        low: number;
        close: number;
        price: number;
        openMarketCap: number;
        highMarketCap: number;
        lowMarketCap: number;
        closeMarketCap: number;
        marketCap: number;
        blockNumber: number;
        volumeQuote: number;
        tradeCount: number;
        synthetic: false;
      }>;

      for (const candle of candles.values()) {
        const open = previousClose ?? candle.open;
        const openMarketCap = previousMarketCap ?? candle.openMarketCap;
        points.push({
          ...candle,
          open,
          high: Math.max(candle.high, open),
          low: Math.min(candle.low, open),
          openMarketCap,
          highMarketCap: Math.max(candle.highMarketCap, openMarketCap),
          lowMarketCap: Math.min(candle.lowMarketCap, openMarketCap),
        });
        previousClose = candle.close;
        previousMarketCap = candle.closeMarketCap;
      }

      const lastIndexedTimestamp = rows.length ? Number(rows.at(-1)!.lastTradeAt) : prior ? Number(prior.timestamp) : null;

      return {
        token,
        range,
        intervalSeconds: config.intervalSeconds,
        windowStart: startSeconds,
        windowEnd: endBucket,
        hasMore: Boolean(prior),
        priorPrice,
        priorMarketCap,
        priorPriceUp,
        priorMarketCapUp,
        priorTimestamp: prior ? Number(prior.timestamp) : null,
        lastTradeTimestamp: lastIndexedTimestamp,
        points,
        updatedAt: lastIndexedTimestamp === null ? Date.now() : lastIndexedTimestamp * 1_000,
        quoteSymbol: "ETH" as const,
        quoteUsd: quote?.value ?? null,
        quoteUsdUpdatedAt: quote?.updatedAt ?? null,
      };
    },
    diagnostic,
  );
}

export async function getTokenTrades(tokenAddress: string, limit = 100, diagnostic?: CacheDiagnostic) {
  const token = normalizeTokenAddress(tokenAddress);
  if (!token) return null;
  const safeLimit = Math.min(250, Math.max(1, Math.trunc(limit)));
  return rememberJson(
    redisCacheKey("market", "trades", token, safeLimit),
    TOKEN_TRADES_CACHE_SECONDS,
    async () => {
      const database = getDatabase();
      const rows = await database.unsafe<TradeRow[]>(`
        SELECT trade.chain_id AS "chainId", trade.venue,
          trade.emitter_address AS "emitterAddress",
          COALESCE(trade.pool_id, graduation.pool_id) AS "poolId",
          trade.is_buy AS "isBuy",
          trade.token_amount::TEXT AS "tokenAmount", trade.eth_gross::TEXT AS "quoteAmount",
          trade.trader_address AS account, trade.transaction_hash AS "transactionHash",
          trade.block_number AS "blockNumber", trade.log_index AS "logIndex",
          EXTRACT(EPOCH FROM trade.traded_at)::BIGINT AS "timestamp"
        FROM ${INDEXER_SCHEMA}.camp_trades trade
        LEFT JOIN ${INDEXER_SCHEMA}.camp_graduations graduation
          ON graduation.chain_id = trade.chain_id
          AND graduation.token_address = trade.token_address
          AND trade.venue = 1
        WHERE trade.chain_id = $1 AND trade.token_address = $2
        ORDER BY trade.block_number DESC, trade.log_index DESC
        LIMIT $3
      `, [KORUM_CHAIN_ID, token, safeLimit]);

      return {
        trades: rows.map((row) => ({
          id: `${row.chainId}:${row.blockNumber}:${row.transactionHash}:${row.logIndex}`,
          venue: row.venue === 0 ? "curve" as const : "pool" as const,
          emitterAddress: row.emitterAddress,
          poolId: row.poolId,
          side: row.isBuy ? "buy" as const : "sell" as const,
          tokenAmount: formatBaseUnits(row.tokenAmount),
          quoteAmount: formatBaseUnits(row.quoteAmount),
          account: row.account,
          transactionHash: row.transactionHash,
          blockNumber: Number(row.blockNumber),
          timestamp: Number(row.timestamp),
        })),
      };
    },
    diagnostic,
  );
}

export async function getRecentMarketTrades(limit = 50, diagnostic?: CacheDiagnostic) {
  const safeLimit = Math.min(100, Math.max(1, Math.trunc(limit)));
  const [result, quote] = await Promise.all([
    rememberJson(
      redisCacheKey("market", "recent-trades", safeLimit),
      RECENT_MARKET_TRADES_CACHE_SECONDS,
      async () => {
        const database = getDatabase();
        const rows = await database.unsafe<RecentTradeRow[]>(`
          SELECT trade.chain_id AS "chainId", trade.venue, trade.is_buy AS "isBuy",
            trade.emitter_address AS "emitterAddress",
            COALESCE(trade.pool_id, graduation.pool_id) AS "poolId",
            trade.token_amount::TEXT AS "tokenAmount", trade.eth_gross::TEXT AS "quoteAmount",
            trade.trader_address AS account, trade.transaction_hash AS "transactionHash",
            trade.block_number AS "blockNumber", trade.log_index AS "logIndex",
            EXTRACT(EPOCH FROM trade.traded_at)::BIGINT AS "timestamp",
            camp.versus_id::TEXT AS "versusId", camp.name AS "tokenName",
            camp.symbol AS "tokenSymbol"
          FROM ${INDEXER_SCHEMA}.camp_trades trade
          INNER JOIN ${INDEXER_SCHEMA}.versus_camps camp
            ON camp.chain_id = trade.chain_id
            AND camp.token_address = trade.token_address
          LEFT JOIN ${INDEXER_SCHEMA}.camp_graduations graduation
            ON graduation.chain_id = trade.chain_id
            AND graduation.token_address = trade.token_address
            AND trade.venue = 1
          WHERE trade.chain_id = $1
          ORDER BY trade.block_number DESC, trade.log_index DESC
          LIMIT $2
        `, [KORUM_CHAIN_ID, safeLimit]);

        return {
          trades: rows.map((row) => ({
            id: `${row.chainId}:${row.blockNumber}:${row.transactionHash}:${row.logIndex}`,
            versusId: row.versusId,
            venue: row.venue === 0 ? "curve" as const : "pool" as const,
            emitterAddress: row.emitterAddress,
            poolId: row.poolId,
            side: row.isBuy ? "buy" as const : "sell" as const,
            tokenAmount: formatBaseUnits(row.tokenAmount),
            quoteAmount: formatBaseUnits(row.quoteAmount),
            account: row.account,
            tokenName: row.tokenName,
            tokenSymbol: row.tokenSymbol,
            transactionHash: row.transactionHash,
            blockNumber: Number(row.blockNumber),
            timestamp: Number(row.timestamp),
          })),
        };
      },
      diagnostic,
    ),
    getEthUsdQuote(),
  ]);

  return {
    ...result,
    quoteSymbol: "ETH" as const,
    quoteUsd: quote?.value ?? null,
    quoteUsdUpdatedAt: quote?.updatedAt ?? null,
  };
}
