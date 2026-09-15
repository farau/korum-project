import "server-only";

import { KORUM_CHAIN_ID } from "../../config/korum-network";
import { redisCacheKey, rememberJson, type CacheDiagnostic } from "../cache/redis";
import { getEthUsdQuote } from "../markets/quote-usd";
import { tokenPriceWad, unitsNumber } from "../markets/math";
import { getDatabase } from "./client";

const TOKEN_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export type MarketRange = "1h" | "1d" | "7d" | "30d" | "180d";

const RANGE_CONFIG: Record<MarketRange, { seconds: number; intervalSeconds: number; cacheSeconds: number }> = {
  "1h": { seconds: 60 * 60, intervalSeconds: 60, cacheSeconds: 5 },
  "1d": { seconds: 24 * 60 * 60, intervalSeconds: 15 * 60, cacheSeconds: 15 },
  "7d": { seconds: 7 * 24 * 60 * 60, intervalSeconds: 60 * 60, cacheSeconds: 30 },
  "30d": { seconds: 30 * 24 * 60 * 60, intervalSeconds: 4 * 60 * 60, cacheSeconds: 60 },
  "180d": { seconds: 180 * 24 * 60 * 60, intervalSeconds: 24 * 60 * 60, cacheSeconds: 300 },
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
  blockNumber: number | string;
  volumeQuote: string;
  tradeCount: number;
};

type PriorChartRow = {
  sqrtPriceX96: string;
  circulatingSupply: string;
  blockNumber: number | string;
  timestamp: number | string;
};

type TradeRow = {
  chainId: number | string;
  venue: number;
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

export async function getTokenChart(tokenAddress: string, range: MarketRange, diagnostic?: CacheDiagnostic) {
  const token = normalizeTokenAddress(tokenAddress);
  if (!token) return null;

  const config = RANGE_CONFIG[range];
  return rememberJson(
    redisCacheKey("market", "chart-v3", token, range),
    config.cacheSeconds,
    async () => {
      const database = getDatabase();
      const nowSeconds = Math.floor(Date.now() / 1_000);
      const startSeconds = nowSeconds - config.seconds;
      const [rows, quote] = await Promise.all([
        database.unsafe<ChartRow[]>(`
          WITH enriched AS (
            SELECT trade.*,
              CASE
                WHEN trade.venue = 1 AND graduation.token_residual IS NOT NULL
                  THEN camp.total_supply - graduation.token_residual
                ELSE camp.total_supply - trade.token_reserve_after
              END AS circulating_supply
            FROM indexer.camp_trades trade
            JOIN indexer.versus_camps camp
              ON camp.chain_id = trade.chain_id AND camp.token_address = trade.token_address
            LEFT JOIN indexer.camp_graduations graduation
              ON graduation.chain_id = trade.chain_id AND graduation.token_address = trade.token_address
            WHERE trade.chain_id = $1
              AND trade.token_address = $2
              AND trade.traded_at >= TO_TIMESTAMP($4::DOUBLE PRECISION)
              AND trade.traded_at <= TO_TIMESTAMP($5::DOUBLE PRECISION)
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
            MAX(block_number) AS "blockNumber",
            SUM(eth_gross)::TEXT AS "volumeQuote",
            COUNT(*)::INTEGER AS "tradeCount"
          FROM enriched
          GROUP BY FLOOR(EXTRACT(EPOCH FROM traded_at) / $3)
          ORDER BY "timestamp" ASC
        `, [KORUM_CHAIN_ID, token, config.intervalSeconds, startSeconds, nowSeconds]),
        getEthUsdQuote(),
      ]);

      const priorRows = rows.length ? await database.unsafe<PriorChartRow[]>(`
        SELECT trade.sqrt_price_x96_after::TEXT AS "sqrtPriceX96",
          CASE
            WHEN trade.venue = 1 AND graduation.token_residual IS NOT NULL
              THEN camp.total_supply - graduation.token_residual
            ELSE camp.total_supply - trade.token_reserve_after
          END::TEXT AS "circulatingSupply",
          trade.block_number AS "blockNumber",
          EXTRACT(EPOCH FROM trade.traded_at)::BIGINT AS "timestamp"
        FROM indexer.camp_trades trade
        JOIN indexer.versus_camps camp
          ON camp.chain_id = trade.chain_id AND camp.token_address = trade.token_address
        LEFT JOIN indexer.camp_graduations graduation
          ON graduation.chain_id = trade.chain_id AND graduation.token_address = trade.token_address
        WHERE trade.chain_id = $1
          AND trade.token_address = $2
          AND trade.traded_at < TO_TIMESTAMP($3::DOUBLE PRECISION)
        ORDER BY trade.block_number DESC, trade.log_index DESC
        LIMIT 1
      `, [KORUM_CHAIN_ID, token, Number(rows[0].timestamp)]) : [];

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
        const highMarketCap = marketCap(high, row.highCirculatingSupply);
        const lowMarketCap = marketCap(low, row.lowCirculatingSupply);
        const closeMarketCap = marketCap(close, row.closeCirculatingSupply);
        const volumeQuote = unitsNumber(row.volumeQuote);
        if (open === null || high === null || low === null || close === null || openMarketCap === null || highMarketCap === null || lowMarketCap === null || closeMarketCap === null || volumeQuote === null) return;
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
      let previousClose = prior
        ? unitsNumber(tokenPriceWad(prior.sqrtPriceX96))
        : null;
      let previousMarketCap = prior ? marketCap(previousClose, prior.circulatingSupply) : null;
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

      const lastIndexedTimestamp = rows.length
        ? Number(rows.at(-1)!.timestamp)
        : prior
          ? Number(prior.timestamp)
          : null;

      return {
        token,
        range,
        intervalSeconds: config.intervalSeconds,
        windowStart: startSeconds,
        windowEnd: nowSeconds,
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
        SELECT chain_id AS "chainId", venue, is_buy AS "isBuy",
          token_amount::TEXT AS "tokenAmount", eth_gross::TEXT AS "quoteAmount",
          trader_address AS account, transaction_hash AS "transactionHash",
          block_number AS "blockNumber", log_index AS "logIndex",
          EXTRACT(EPOCH FROM traded_at)::BIGINT AS "timestamp"
        FROM indexer.camp_trades
        WHERE chain_id = $1 AND token_address = $2
        ORDER BY block_number DESC, log_index DESC
        LIMIT $3
      `, [KORUM_CHAIN_ID, token, safeLimit]);

      return {
        trades: rows.map((row) => ({
          id: `${row.chainId}:${row.blockNumber}:${row.transactionHash}:${row.logIndex}`,
          venue: row.venue === 0 ? "curve" as const : "pool" as const,
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
            trade.token_amount::TEXT AS "tokenAmount", trade.eth_gross::TEXT AS "quoteAmount",
            trade.trader_address AS account, trade.transaction_hash AS "transactionHash",
            trade.block_number AS "blockNumber", trade.log_index AS "logIndex",
            EXTRACT(EPOCH FROM trade.traded_at)::BIGINT AS "timestamp",
            camp.versus_id::TEXT AS "versusId", camp.name AS "tokenName",
            camp.symbol AS "tokenSymbol"
          FROM indexer.camp_trades trade
          INNER JOIN indexer.versus_camps camp
            ON camp.chain_id = trade.chain_id
            AND camp.token_address = trade.token_address
          WHERE trade.chain_id = $1
          ORDER BY trade.block_number DESC, trade.log_index DESC
          LIMIT $2
        `, [KORUM_CHAIN_ID, safeLimit]);

        return {
          trades: rows.map((row) => ({
            id: `${row.chainId}:${row.blockNumber}:${row.transactionHash}:${row.logIndex}`,
            versusId: row.versusId,
            venue: row.venue === 0 ? "curve" as const : "pool" as const,
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
