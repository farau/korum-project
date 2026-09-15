import "server-only";

import { formatEther } from "viem";
import { KORUM_CHAIN_ID } from "../../config/korum-network";
import { calculateBadgeProgress } from "../badges";
import { redisCacheKey, rememberJson, type CacheDiagnostic } from "../cache/redis";
import type { LeaderboardSort, TraderLeaderboardPage } from "../leaderboard";
import { getEthUsdQuote } from "../markets/quote-usd";
import { getLaunchConfig } from "../markets/pnl";
import { getDatabase } from "./client";

type ConfigIdRow = { configId: number | string };
type LeaderboardDatabaseRow = {
  rank: number | string;
  traderWallet: string;
  displayName: string;
  pnlWei: string | null;
  volumeWei: string;
  tradeCount: number;
  totalItems: number;
  versusCreated: number;
  creatorVolumeWei: string;
  referralCount: number;
  referredVolumeWei: string;
};

export const LEADERBOARD_PAGE_SIZE = 12;
export const LEADERBOARD_CACHE_SECONDS = 300;
const MAX_PAGE_SIZE = 50;

function amountEth(value: string | null) {
  if (value === null || !/^-?\d+$/.test(value)) return null;
  const parsed = Number(formatEther(BigInt(value)));
  return Number.isFinite(parsed) ? parsed : null;
}

async function loadTraderLeaderboard(
  page: number,
  pageSize: number,
  sort: LeaderboardSort,
  search: string,
): Promise<TraderLeaderboardPage> {
  const database = getDatabase();
  const configIds = await database.unsafe<ConfigIdRow[]>(`
    SELECT DISTINCT versus.config_id AS "configId"
    FROM indexer.trader_positions position
    JOIN indexer.versus_camps camp
      ON camp.chain_id = position.chain_id AND camp.token_address = position.token_address
    JOIN indexer.versuses versus
      ON versus.chain_id = camp.chain_id AND versus.versus_id = camp.versus_id
    WHERE position.chain_id = $1
  `, [KORUM_CHAIN_ID]);

  const loadedConfigs = await Promise.all(configIds.map(async ({ configId }) => {
    const id = String(configId);
    const config = await getLaunchConfig(id);
    return config ? {
      configId: id,
      tier1Eth: config.tier1Eth.toString(),
      tier2Eth: config.tier2Eth.toString(),
      fee1Bps: config.fee1Bps,
      fee2Bps: config.fee2Bps,
      fee3Bps: config.fee3Bps,
    } : null;
  }));
  const configJson = JSON.stringify(loadedConfigs.filter((config) => config !== null));
  const orderBy = sort === "volume"
    ? "volume_wei DESC, pnl_wei DESC NULLS LAST, trader_wallet ASC"
    : "pnl_wei DESC NULLS LAST, volume_wei DESC, trader_wallet ASC";
  const offset = (page - 1) * pageSize;

  const rowsPromise = database.unsafe<LeaderboardDatabaseRow[]>(`
    WITH configs AS (
      SELECT
        (value->>'configId')::INTEGER AS config_id,
        (value->>'tier1Eth')::NUMERIC AS tier1_eth,
        (value->>'tier2Eth')::NUMERIC AS tier2_eth,
        (value->>'fee1Bps')::INTEGER AS fee1_bps,
        (value->>'fee2Bps')::INTEGER AS fee2_bps,
        (value->>'fee3Bps')::INTEGER AS fee3_bps
      FROM JSONB_ARRAY_ELEMENTS($2::TEXT::JSONB) value
    ),
    positions AS (
      SELECT
        position.trader_address,
        camp.versus_id,
        position.token_address,
        market.curve_status,
        market.virtual_eth,
        market.real_eth_after,
        market.token_reserve_after,
        market.cumulative_volume_after,
        config.config_id,
        config.tier1_eth,
        config.tier2_eth,
        config.fee1_bps,
        config.fee2_bps,
        config.fee3_bps,
        position.net_token_amount AS net_tokens,
        position.net_cash_flow_wei AS cash_flow
      FROM indexer.trader_positions position
      JOIN indexer.versus_camps camp
        ON camp.chain_id = position.chain_id AND camp.token_address = position.token_address
      JOIN indexer.versuses versus
        ON versus.chain_id = camp.chain_id AND versus.versus_id = camp.versus_id
      LEFT JOIN indexer.camp_market_state market
        ON market.chain_id = position.chain_id AND market.token_address = position.token_address
      LEFT JOIN configs config ON config.config_id = versus.config_id
      WHERE position.chain_id = $1
        AND position.trader_address <> '0x0000000000000000000000000000000000000000'
    ),
    liquidations AS (
      SELECT
        position.*,
        CASE
          WHEN net_tokens = 0 THEN 0::NUMERIC
          WHEN net_tokens > 0
            AND curve_status = 1
            AND config_id IS NOT NULL
            AND virtual_eth IS NOT NULL
            AND real_eth_after IS NOT NULL
            AND token_reserve_after IS NOT NULL
            AND cumulative_volume_after IS NOT NULL
          THEN FLOOR((virtual_eth + real_eth_after) * net_tokens / (token_reserve_after + net_tokens))
          ELSE NULL
        END AS gross_liquidation,
        CASE
          WHEN net_tokens = 0 THEN 0
          WHEN cumulative_volume_after < tier1_eth THEN fee1_bps
          WHEN cumulative_volume_after < tier2_eth THEN fee2_bps
          ELSE fee3_bps
        END AS liquidation_fee_bps
      FROM positions position
    ),
    versus_pnl AS (
      SELECT
        trader_address,
        versus_id,
        BOOL_AND(net_tokens >= 0 AND gross_liquidation IS NOT NULL) AS is_calculable,
        SUM(cash_flow + gross_liquidation - FLOOR(gross_liquidation * liquidation_fee_bps / 10000)) AS pnl_wei
      FROM liquidations
      GROUP BY trader_address, versus_id
    ),
    pnl_totals AS (
      SELECT
        trader_address,
        CASE WHEN BOOL_AND(is_calculable) THEN SUM(pnl_wei) ELSE NULL END AS pnl_wei
      FROM versus_pnl
      GROUP BY trader_address
    ),
    trade_totals AS (
      SELECT
        trader_address,
        total_volume_wei AS volume_wei,
        trade_count::INTEGER AS trade_count
      FROM indexer.trader_totals
      WHERE chain_id = $1
        AND trader_address <> '0x0000000000000000000000000000000000000000'
    ),
    leaderboard AS (
      SELECT
        totals.trader_address AS trader_wallet,
        COALESCE(NULLIF(BTRIM(users.display_name), ''), totals.trader_address) AS display_name,
        pnl.pnl_wei,
        totals.volume_wei,
        totals.trade_count
      FROM trade_totals totals
      LEFT JOIN pnl_totals pnl ON pnl.trader_address = totals.trader_address
      LEFT JOIN public.users users ON users.evm_wallet = totals.trader_address
    ),
    ranked AS (
      SELECT
        ROW_NUMBER() OVER (ORDER BY ${orderBy}) AS rank,
        trader_wallet,
        display_name,
        pnl_wei,
        volume_wei,
        trade_count
      FROM leaderboard
    ),
    filtered AS (
      SELECT ranked.*, COUNT(*) OVER ()::INTEGER AS total_items
      FROM ranked
      WHERE $3 = '' OR display_name ILIKE '%' || $3 || '%' OR trader_wallet ILIKE '%' || $3 || '%'
    )
    , paged AS (
      SELECT *
      FROM filtered
      ORDER BY rank
      LIMIT $4 OFFSET $5
    )
    SELECT
      paged.rank,
      paged.trader_wallet AS "traderWallet",
      paged.display_name AS "displayName",
      paged.pnl_wei::TEXT AS "pnlWei",
      paged.volume_wei::TEXT AS "volumeWei",
      paged.trade_count AS "tradeCount",
      paged.total_items AS "totalItems",
      creator.versus_created AS "versusCreated",
      creator.generated_volume_wei::TEXT AS "creatorVolumeWei",
      referral.referral_count AS "referralCount",
      referral.referred_volume_wei::TEXT AS "referredVolumeWei"
    FROM paged
    LEFT JOIN LATERAL (
      SELECT
        COUNT(DISTINCT versus.versus_id)::INTEGER AS versus_created,
        COALESCE(SUM(COALESCE(market.cumulative_volume_after, 0)), 0) AS generated_volume_wei
      FROM indexer.versuses versus
      LEFT JOIN indexer.versus_camps camp
        ON camp.chain_id = versus.chain_id AND camp.versus_id = versus.versus_id
      LEFT JOIN indexer.camp_market_state market
        ON market.chain_id = camp.chain_id AND market.token_address = camp.token_address
      WHERE versus.chain_id = $1 AND versus.creator_wallet = paged.trader_wallet
    ) creator ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        COUNT(binding.user_wallet)::INTEGER AS referral_count,
        COALESCE(SUM(COALESCE(referred.total_volume_wei, 0)), 0) AS referred_volume_wei
      FROM indexer.referral_bindings binding
      LEFT JOIN indexer.trader_totals referred
        ON referred.chain_id = binding.chain_id AND referred.trader_address = binding.user_wallet
      WHERE binding.chain_id = $1 AND binding.referrer_wallet = paged.trader_wallet
    ) referral ON TRUE
    ORDER BY paged.rank
  `, [KORUM_CHAIN_ID, configJson, search, pageSize, offset]);

  const [rows, quote] = await Promise.all([rowsPromise, getEthUsdQuote()]);
  const quoteUsd = quote?.value ?? null;
  const totalItems = rows[0]?.totalItems ?? 0;

  return {
    items: rows.map((row) => {
      const pnlEth = amountEth(row.pnlWei);
      const volumeEth = amountEth(row.volumeWei) ?? 0;
      const creatorVolumeEth = amountEth(row.creatorVolumeWei) ?? 0;
      const referredVolumeEth = amountEth(row.referredVolumeWei) ?? 0;
      const badge = calculateBadgeProgress({
        versusCreated: row.versusCreated,
        creatorVolumeUsd: quoteUsd === null ? null : creatorVolumeEth * quoteUsd,
        tradeCount: row.tradeCount,
        tradedVolumeUsd: quoteUsd === null ? null : volumeEth * quoteUsd,
        referralCount: row.referralCount,
        referredVolumeUsd: quoteUsd === null ? null : referredVolumeEth * quoteUsd,
      }).overall;
      return {
        rank: Number(row.rank),
        wallet: row.traderWallet,
        name: row.displayName,
        pnlEth,
        pnlUsd: pnlEth !== null && quoteUsd !== null ? pnlEth * quoteUsd : null,
        volumeEth,
        volumeUsd: quoteUsd !== null ? volumeEth * quoteUsd : null,
        tradeCount: row.tradeCount,
        badge: badge?.name ?? null,
      };
    }),
    page,
    pageSize,
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
    sort,
    search,
  };
}

export function getTraderLeaderboard(
  options: { page?: number; pageSize?: number; sort?: LeaderboardSort; search?: string } = {},
  diagnostic?: CacheDiagnostic,
) {
  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(options.pageSize ?? LEADERBOARD_PAGE_SIZE)));
  const sort: LeaderboardSort = options.sort === "volume" ? "volume" : "pnl";
  const search = (options.search ?? "").trim().slice(0, 64);

  if (search) {
    if (diagnostic) diagnostic.status = "BYPASS";
    return loadTraderLeaderboard(page, pageSize, sort, search);
  }

  return rememberJson(
    redisCacheKey("leaderboard", "traders-v3", sort, page, pageSize),
    LEADERBOARD_CACHE_SECONDS,
    () => loadTraderLeaderboard(page, pageSize, sort, search),
    diagnostic,
  );
}
