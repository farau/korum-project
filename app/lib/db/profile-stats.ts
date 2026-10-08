import "server-only";
import { sellFeeBps } from "../contracts/economics";

import { INDEXER_SCHEMA } from "../../config/deployment";

import { createHash } from "node:crypto";
import { formatEther, getAddress } from "viem";
import { KORUM_CHAIN_ID } from "../../config/korum-network";
import { redisCacheKey, rememberJson, type CacheDiagnostic } from "../cache/redis";
import { getEthUsdQuote } from "../markets/quote-usd";
import { unitsNumber } from "../markets/math";
import { getLaunchConfig } from "../markets/pnl";
import type { UserProfileStats } from "../profile";
import { getDatabase } from "./client";

type ProfileStatsRow = {
  referralCount: number;
  activeReferralCount: number;
  versusCreated: number;
  versusJoined: number;
  tradeCount: number;
  tradedVolumeWei: string;
  creatorVolumeWei: string;
  referredVolumeWei: string;
};

type ProfilePositionRow = {
  versusId: string;
  tokenAddress: `0x${string}`;
  configId: number | string;
  virtualEth: string;
  graduationEth: string;
  realEthAfter: string | null;
  tokenReserveAfter: string | null;
  cumulativeVolumeAfter: string | null;
  netTokenAmount: string;
  netCashFlowWei: string;
  curveStatus: number;
};

const PROFILE_STATS_CACHE_TTL_SECONDS = 20;

function signedBigInt(value: string) {
  return /^-?\d+$/.test(value) ? BigInt(value) : null;
}

async function calculateEstimatedPnl(rows: ProfilePositionRow[]) {
  const parsedRows = rows.map((row) => ({
    ...row,
    virtualEth: signedBigInt(row.virtualEth),
    graduationEth: signedBigInt(row.graduationEth),
    realEthAfter: signedBigInt(row.realEthAfter ?? ""),
    tokenReserveAfter: signedBigInt(row.tokenReserveAfter ?? ""),
    cumulativeVolumeAfter: signedBigInt(row.cumulativeVolumeAfter ?? ""),
    netTokenAmount: signedBigInt(row.netTokenAmount),
    netCashFlowWei: signedBigInt(row.netCashFlowWei),
  }));
  if (parsedRows.some((row) => row.netTokenAmount === null || row.netCashFlowWei === null || row.netTokenAmount < BigInt(0))) return null;

  const openRows = parsedRows.filter((row) => row.netTokenAmount! > BigInt(0));
  if (openRows.length > 25 || openRows.some((row) => (
    row.curveStatus !== 1
    || row.virtualEth === null || row.graduationEth === null
    || row.realEthAfter === null
    || row.tokenReserveAfter === null
    || row.cumulativeVolumeAfter === null
  ))) return null;

  const configIds = [...new Set(openRows.map((row) => String(row.configId)))];
  const configEntries = await Promise.all(configIds.map(async (configId) => {
    const config = await getLaunchConfig(configId);
    return config ? [configId, config] as const : null;
  }));
  if (configEntries.some((entry) => entry === null)) return null;

  const configs = new Map(configEntries.map((entry) => entry!));
  const pnlByVersus = new Map<string, bigint>();
  for (const row of parsedRows) {
    let liquidationValueWei = BigInt(0);
    if (row.netTokenAmount! > BigInt(0)) {
      const config = configs.get(String(row.configId));
      if (!config || row.virtualEth === null || row.graduationEth === null || row.realEthAfter === null || row.tokenReserveAfter === null || row.cumulativeVolumeAfter === null) return null;

      const gross = (row.virtualEth + row.realEthAfter) * row.netTokenAmount!
        / (row.tokenReserveAfter + row.netTokenAmount!);
      const feeBps = sellFeeBps(config, row.graduationEth!, row.cumulativeVolumeAfter);
      liquidationValueWei = gross - gross * BigInt(feeBps) / BigInt(10_000);
    }
    pnlByVersus.set(
      row.versusId,
      (pnlByVersus.get(row.versusId) ?? BigInt(0)) + row.netCashFlowWei! + liquidationValueWei,
    );
  }

  const values = [...pnlByVersus.values()];
  return {
    pnlWei: values.reduce((sum, value) => sum + value, BigInt(0)),
    winningVersus: values.filter((value) => value > BigInt(0)).length,
    losingVersus: values.filter((value) => value < BigInt(0)).length,
  };
}

async function loadUserProfileStats(wallet: string): Promise<UserProfileStats> {
  const database = getDatabase();

  const [rows, positionRows, quote] = await Promise.all([
    database.unsafe<ProfileStatsRow[]>(`
      SELECT
        (
          SELECT COUNT(*)::INTEGER
          FROM ${INDEXER_SCHEMA}.referral_bindings binding
          WHERE binding.chain_id = $1
            AND binding.referrer_wallet = $2
        ) AS "referralCount",
        (
          SELECT COUNT(*)::INTEGER
          FROM ${INDEXER_SCHEMA}.referral_bindings binding
          JOIN ${INDEXER_SCHEMA}.trader_totals totals
            ON totals.chain_id = binding.chain_id
            AND totals.trader_address = binding.user_wallet
          WHERE binding.chain_id = $1
            AND binding.referrer_wallet = $2
            AND totals.trade_count > 0
        ) AS "activeReferralCount",
        (
          SELECT COUNT(*)::INTEGER
          FROM ${INDEXER_SCHEMA}.versuses versus
          WHERE versus.chain_id = $1
            AND versus.creator_wallet = $2
        ) AS "versusCreated",
        (
          SELECT COUNT(DISTINCT camp.versus_id)::INTEGER
          FROM ${INDEXER_SCHEMA}.camp_trades trade
          JOIN ${INDEXER_SCHEMA}.versus_camps camp
            ON camp.chain_id = trade.chain_id
            AND camp.token_address = trade.token_address
          WHERE trade.chain_id = $1
            AND trade.trader_address = $2
        ) AS "versusJoined",
        (
          SELECT COALESCE(totals.trade_count, 0)::INTEGER
          FROM ${INDEXER_SCHEMA}.trader_totals totals
          WHERE totals.chain_id = $1
            AND totals.trader_address = $2
        ) AS "tradeCount",
        (
          SELECT COALESCE(totals.total_volume_wei, 0)::TEXT
          FROM ${INDEXER_SCHEMA}.trader_totals totals
          WHERE totals.chain_id = $1
            AND totals.trader_address = $2
        ) AS "tradedVolumeWei",
        (
          SELECT COALESCE(SUM(COALESCE(market.cumulative_volume_after, 0)), 0)::TEXT
          FROM ${INDEXER_SCHEMA}.versuses versus
          JOIN ${INDEXER_SCHEMA}.versus_camps camp
            ON camp.chain_id = versus.chain_id
            AND camp.versus_id = versus.versus_id
          LEFT JOIN ${INDEXER_SCHEMA}.camp_market_state market
            ON market.chain_id = camp.chain_id
            AND market.token_address = camp.token_address
          WHERE versus.chain_id = $1
            AND versus.creator_wallet = $2
        ) AS "creatorVolumeWei",
        (
          SELECT COALESCE(SUM(COALESCE(totals.total_volume_wei, 0)), 0)::TEXT
          FROM ${INDEXER_SCHEMA}.referral_bindings binding
          LEFT JOIN ${INDEXER_SCHEMA}.trader_totals totals
            ON totals.chain_id = binding.chain_id
            AND totals.trader_address = binding.user_wallet
          WHERE binding.chain_id = $1
            AND binding.referrer_wallet = $2
        ) AS "referredVolumeWei"
    `, [KORUM_CHAIN_ID, wallet]),
    database.unsafe<ProfilePositionRow[]>(`
      SELECT
        camp.versus_id::TEXT AS "versusId",
        position.token_address AS "tokenAddress",
        versus.config_id AS "configId",
        market.virtual_eth::TEXT AS "virtualEth",
        market.graduation_eth::TEXT AS "graduationEth",
        market.real_eth_after::TEXT AS "realEthAfter",
        market.token_reserve_after::TEXT AS "tokenReserveAfter",
        market.cumulative_volume_after::TEXT AS "cumulativeVolumeAfter",
        position.net_token_amount::TEXT AS "netTokenAmount",
        position.net_cash_flow_wei::TEXT AS "netCashFlowWei",
        market.curve_status AS "curveStatus"
      FROM ${INDEXER_SCHEMA}.trader_positions position
      JOIN ${INDEXER_SCHEMA}.versus_camps camp
        ON camp.chain_id = position.chain_id
        AND camp.token_address = position.token_address
      JOIN ${INDEXER_SCHEMA}.versuses versus
        ON versus.chain_id = camp.chain_id
        AND versus.versus_id = camp.versus_id
      LEFT JOIN ${INDEXER_SCHEMA}.camp_market_state market
        ON market.chain_id = position.chain_id
        AND market.token_address = position.token_address
      WHERE position.chain_id = $1
        AND position.trader_address = $2
    `, [KORUM_CHAIN_ID, wallet]),
    getEthUsdQuote(),
  ]);

  const row = rows[0];
  const tradedVolumeEth = unitsNumber(row?.tradedVolumeWei ?? "0") ?? 0;
  const creatorVolumeEth = unitsNumber(row?.creatorVolumeWei ?? "0") ?? 0;
  const referredVolumeEth = unitsNumber(row?.referredVolumeWei ?? "0") ?? 0;
  const estimated = await calculateEstimatedPnl(positionRows);
  const estimatedPnlEth = estimated ? Number(formatEther(estimated.pnlWei)) : null;

  return {
    referralCount: row?.referralCount ?? 0,
    activeReferralCount: row?.activeReferralCount ?? 0,
    versusCreated: row?.versusCreated ?? 0,
    versusJoined: row?.versusJoined ?? 0,
    tradeCount: row?.tradeCount ?? 0,
    tradedVolumeEth,
    tradedVolumeUsd: quote ? tradedVolumeEth * quote.value : null,
    creatorVolumeEth,
    creatorVolumeUsd: quote ? creatorVolumeEth * quote.value : null,
    referredVolumeEth,
    referredVolumeUsd: quote ? referredVolumeEth * quote.value : null,
    estimatedPnlEth,
    estimatedPnlUsd: estimatedPnlEth !== null && quote ? estimatedPnlEth * quote.value : null,
    winningVersus: estimated?.winningVersus ?? 0,
    losingVersus: estimated?.losingVersus ?? 0,
  };
}

export async function getUserProfileStats(
  address: `0x${string}`,
  diagnostic?: CacheDiagnostic,
): Promise<UserProfileStats> {
  const wallet = getAddress(address).toLowerCase();
  const walletKey = createHash("sha256").update(wallet).digest("hex");

  return rememberJson(
    redisCacheKey("private", "profile-stats-v5", walletKey),
    PROFILE_STATS_CACHE_TTL_SECONDS,
    () => loadUserProfileStats(wallet),
    diagnostic,
  );
}
