import "server-only";
import { sellFeeBps } from "../contracts/economics";

import { formatEther } from "viem";
import type { CacheDiagnostic } from "../cache/redis";
import { getEthUsdQuote } from "../markets/quote-usd";
import { marketValueWei, unitsNumber } from "../markets/math";
import { getLaunchConfig } from "../markets/pnl";
import type { UserProfileStats } from "../profile";
import { getProfileSource, type ProfileTradePosition } from "./profile-source";
import { getProfileMarkets } from "./profile-markets";

type ProfilePositionRow = ProfileTradePosition & {
  virtualEth: string | null;
  graduationEth: string | null;
  realEthAfter: string | null;
  tokenReserveAfter: string | null;
  cumulativeVolumeAfter: string | null;
  curveStatus: number | null;
  poolSqrtPriceX96: string | null;
};

function signedBigInt(value: string | null) {
  return value !== null && /^-?\d+$/.test(value) ? BigInt(value) : null;
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
  if (openRows.length > 25 || openRows.some((row) => row.curveStatus !== 1 && row.curveStatus !== 3)) return null;

  // Pool spot estimates do not need the launch configuration or curve reserves.
  const configIds = [...new Set(openRows.filter(row => row.curveStatus === 1).map(row => String(row.configId)))];
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
      if (row.curveStatus === 3) {
        // Same valuation as Holdings: balance × latest indexed pool spot price.
        // Pool selling fees and price impact are deliberately not estimated.
        const poolValueWei = marketValueWei(row.poolSqrtPriceX96, row.netTokenAmount!.toString());
        if (poolValueWei === null) return null;
        liquidationValueWei = poolValueWei;
      } else {
        const config = configs.get(String(row.configId));
        if (!config || row.virtualEth === null || row.graduationEth === null || row.realEthAfter === null || row.tokenReserveAfter === null || row.cumulativeVolumeAfter === null
          || row.virtualEth < BigInt(0) || row.graduationEth <= BigInt(0) || row.realEthAfter < BigInt(0)
          || row.tokenReserveAfter < BigInt(0) || row.cumulativeVolumeAfter < BigInt(0)) return null;

        const gross = (row.virtualEth + row.realEthAfter) * row.netTokenAmount!
          / (row.tokenReserveAfter + row.netTokenAmount!);
        const feeBps = sellFeeBps(config, row.graduationEth, row.cumulativeVolumeAfter);
        liquidationValueWei = gross - gross * BigInt(feeBps) / BigInt(10_000);
      }
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
    usesPoolPrice: openRows.some(row => row.curveStatus === 3),
  };
}

export async function getUserProfileStats(
  address: `0x${string}`,
  diagnostic?: CacheDiagnostic,
): Promise<UserProfileStats> {
  const [source, quote] = await Promise.all([getProfileSource(address, diagnostic), getEthUsdQuote()]);
  const open = source.positions.filter(position => /^\d+$/.test(position.netTokenAmount) && BigInt(position.netTokenAmount) > BigInt(0));
  const markets = open.length <= 25 ? await getProfileMarkets(open) : new Map();
  const positionRows: ProfilePositionRow[] = source.positions.map(position => ({
    ...position,
    virtualEth: null, graduationEth: null, realEthAfter: null, tokenReserveAfter: null,
    cumulativeVolumeAfter: null, curveStatus: null, poolSqrtPriceX96: null,
    ...markets.get(position.tokenAddress.toLowerCase()),
  }));
  const row = source.stats;
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
    estimatedPnlUsesPoolPrice: estimated?.usesPoolPrice ?? false,
    winningVersus: estimated?.winningVersus ?? 0,
    losingVersus: estimated?.losingVersus ?? 0,
  };
}
