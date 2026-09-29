import "server-only";
import { sellFeeBps } from "../contracts/economics";

import { INDEXER_SCHEMA } from "../../config/deployment";

import { createHash } from "node:crypto";
import { formatEther, formatUnits } from "viem";
import { KORUM_CHAIN_ID } from "../../config/korum-network";
import { redisCacheKey, rememberJson } from "../cache/redis";
import { getLaunchConfig } from "../markets/pnl";
import { getEthUsdQuote } from "../markets/quote-usd";
import { getDatabase } from "./client";

export type VersusPosition = {
  tokenAddress: `0x${string}`;
  tokenName: string;
  tokenSymbol: string;
  tokenAmount: string;
  valueEth: number | null;
  valueUsd: number | null;
  pnlEth: number | null;
  pnlUsd: number | null;
};

export type VersusPositions = {
  positions: VersusPosition[];
  totalPnlEth: number | null;
  totalPnlUsd: number | null;
};

type PositionRow = {
  tokenAddress: `0x${string}`;
  tokenName: string;
  tokenSymbol: string;
  configId: number | string;
  virtualEth: string | null;
  graduationEth: string | null;
  realEthAfter: string | null;
  tokenReserveAfter: string | null;
  cumulativeVolumeAfter: string | null;
  netTokenAmount: string;
  netCashFlowWei: string;
  curveStatus: number | null;
};

function parseInteger(value: string | null) {
  return value !== null && /^-?\d+$/.test(value) ? BigInt(value) : null;
}

function etherNumber(value: bigint) {
  const numeric = Number(formatEther(value));
  return Number.isFinite(numeric) ? numeric : null;
}

const VERSUS_POSITIONS_CACHE_TTL_SECONDS = 30;

async function loadVersusPositions(wallet: string, versusId: string): Promise<VersusPositions> {
  const database = getDatabase();
  const [rows, quote] = await Promise.all([
    database.unsafe<PositionRow[]>(`
      SELECT
        position.token_address AS "tokenAddress",
        camp.name AS "tokenName",
        camp.symbol AS "tokenSymbol",
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
        AND versus.versus_id = $3::NUMERIC
        AND position.net_token_amount > 0
      ORDER BY camp.side ASC
    `, [KORUM_CHAIN_ID, wallet.toLowerCase(), versusId]),
    getEthUsdQuote(),
  ]);

  const configs = new Map<string, Awaited<ReturnType<typeof getLaunchConfig>>>();
  for (const row of rows) {
    const configId = String(row.configId);
    if (!configs.has(configId)) configs.set(configId, await getLaunchConfig(configId));
  }

  const positions = rows.map((row) => {
    const netTokens = parseInteger(row.netTokenAmount);
    const netCashFlow = parseInteger(row.netCashFlowWei);
    const virtualEth = parseInteger(row.virtualEth);
    const graduationEth = parseInteger(row.graduationEth);
    const realEthAfter = parseInteger(row.realEthAfter);
    const tokenReserveAfter = parseInteger(row.tokenReserveAfter);
    const cumulativeVolumeAfter = parseInteger(row.cumulativeVolumeAfter);
    const config = configs.get(String(row.configId));
    const canCalculate = netTokens !== null
      && netCashFlow !== null
      && virtualEth !== null
      && graduationEth !== null
      && realEthAfter !== null
      && tokenReserveAfter !== null
      && cumulativeVolumeAfter !== null
      && config != null
      && row.curveStatus === 1
      && tokenReserveAfter + netTokens > 0;

    let valueWei: bigint | null = null;
    let pnlWei: bigint | null = null;
    if (canCalculate) {
      const gross = (virtualEth + realEthAfter) * netTokens / (tokenReserveAfter + netTokens);
      const feeBps = sellFeeBps(config, graduationEth, cumulativeVolumeAfter);
      valueWei = gross - gross * BigInt(feeBps) / BigInt(10_000);
      pnlWei = netCashFlow + valueWei;
    }

    const valueEth = valueWei === null ? null : etherNumber(valueWei);
    const pnlEth = pnlWei === null ? null : etherNumber(pnlWei);
    return {
      tokenAddress: row.tokenAddress,
      tokenName: row.tokenName,
      tokenSymbol: row.tokenSymbol,
      tokenAmount: netTokens === null ? "0" : formatUnits(netTokens, 18),
      valueEth,
      valueUsd: valueEth !== null && quote ? valueEth * quote.value : null,
      pnlEth,
      pnlUsd: pnlEth !== null && quote ? pnlEth * quote.value : null,
    };
  });

  const calculatedPnl = positions.every((position) => position.pnlEth !== null)
    ? positions.reduce((sum, position) => sum + (position.pnlEth ?? 0), 0)
    : null;
  return {
    positions,
    totalPnlEth: calculatedPnl,
    totalPnlUsd: calculatedPnl !== null && quote ? calculatedPnl * quote.value : null,
  };
}

export function getVersusPositions(wallet: string, versusId: string) {
  const normalizedWallet = wallet.toLowerCase();
  const cacheKey = createHash("sha256")
    .update(`${normalizedWallet}:${versusId}`)
    .digest("hex");

  return rememberJson(
    redisCacheKey("private", "versus-positions-v1", cacheKey),
    VERSUS_POSITIONS_CACHE_TTL_SECONDS,
    () => loadVersusPositions(normalizedWallet, versusId),
  );
}
