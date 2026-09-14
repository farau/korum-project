import "server-only";

import { KORUM_CHAIN_ID } from "../../config/korum-network";
import { redisCacheKey, rememberJson, type CacheDiagnostic } from "../cache/redis";
import { getEthUsdQuote } from "../markets/quote-usd";
import { tokenPriceWad, unitsNumber } from "../markets/math";
import { getDatabase } from "./client";

const TOKEN_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export type MarketRange = "1h" | "1d" | "7d" | "30d" | "180d";

const RANGE_CONFIG: Record<MarketRange, { seconds: number; intervalSeconds: number; cacheSeconds: number }> = {
  "1h": { seconds: 60 * 60, intervalSeconds: 15, cacheSeconds: 5 },
  "1d": { seconds: 24 * 60 * 60, intervalSeconds: 5 * 60, cacheSeconds: 15 },
  "7d": { seconds: 7 * 24 * 60 * 60, intervalSeconds: 60 * 60, cacheSeconds: 30 },
  "30d": { seconds: 30 * 24 * 60 * 60, intervalSeconds: 4 * 60 * 60, cacheSeconds: 60 },
  "180d": { seconds: 180 * 24 * 60 * 60, intervalSeconds: 24 * 60 * 60, cacheSeconds: 300 },
};

export const TOKEN_TRADES_CACHE_SECONDS = 5;
export const RECENT_MARKET_TRADES_CACHE_SECONDS = 5;

type ChartRow = {
  timestamp: number | string;
  sqrtPriceX96: string;
  blockNumber: number | string;
  volumeQuote: string;
  tradeCount: number;
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
    redisCacheKey("market", "chart", token, range),
    config.cacheSeconds,
    async () => {
      const database = getDatabase();
      const [rows, quote] = await Promise.all([
        database.unsafe<ChartRow[]>(`
          SELECT
            FLOOR(EXTRACT(EPOCH FROM traded_at) / $3) * $3 AS "timestamp",
            (ARRAY_AGG(sqrt_price_x96_after::TEXT ORDER BY block_number DESC, log_index DESC))[1] AS "sqrtPriceX96",
            MAX(block_number) AS "blockNumber",
            SUM(eth_gross)::TEXT AS "volumeQuote",
            COUNT(*)::INTEGER AS "tradeCount"
          FROM indexer.camp_trades
          WHERE chain_id = $1
            AND token_address = $2
            AND traded_at >= NOW() - ($4 * INTERVAL '1 second')
          GROUP BY FLOOR(EXTRACT(EPOCH FROM traded_at) / $3)
          ORDER BY "timestamp" ASC
        `, [KORUM_CHAIN_ID, token, config.intervalSeconds, config.seconds]),
        getEthUsdQuote(),
      ]);

      const points = rows.flatMap((row) => {
        const price = unitsNumber(tokenPriceWad(row.sqrtPriceX96));
        const volumeQuote = unitsNumber(row.volumeQuote);
        if (price === null || volumeQuote === null) return [];
        return [{
          t: Number(row.timestamp),
          price,
          blockNumber: Number(row.blockNumber),
          volumeQuote,
          tradeCount: row.tradeCount,
        }];
      });

      return {
        token,
        range,
        intervalSeconds: config.intervalSeconds,
        points,
        updatedAt: points.length ? points.at(-1)!.t * 1_000 : Date.now(),
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
