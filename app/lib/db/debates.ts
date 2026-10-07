import "server-only";

import { INDEXER_SCHEMA, WATCHLIST_TABLE } from "../../config/deployment";

import { cache } from "react";
import { calculateBadgeProgress } from "../badges";
import { KORUM_CHAIN, KORUM_CHAIN_ID } from "../../config/korum-network";
import type { Debate } from "../debates";
import { redisCacheKey, rememberJson, type CacheDiagnostic } from "../cache/redis";
import { getEthUsdQuote } from "../markets/quote-usd";
import { marketValueWei, percentageChange, tokenPriceWad, unitsNumber } from "../markets/math";
import { getDatabase } from "./client";
import { publicAssetUrl } from "../public-asset-url";
export { publicAssetUrl } from "../public-asset-url";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 250;
export const INDEXED_DEBATES_CACHE_SECONDS = 15;
export const INDEXED_DEBATE_SEARCH_CACHE_SECONDS = 45;
export const INDEXED_DEBATE_SEARCH_LIMIT = 24;

type IndexedDebateRow = {
  chainId: number;
  versusId: string;
  title: string;
  description: string;
  category: string;
  socialsJson: string;
  creatorWallet: string;
  feeRecipientA: string;
  feeRecipientB: string;
  creatorDisplayName: string | null;
  creatorIsNew: boolean;
  creatorVersusCreated: number;
  creatorVolumeWei: string;
  createdAt: Date | string;
  tokenAAddress: string;
  tokenAName: string;
  tokenASymbol: string;
  tokenAUri: string;
  tokenBAddress: string;
  tokenBName: string;
  tokenBSymbol: string;
  tokenBUri: string;
  tokenATotalSupply: string;
  tokenACirculatingSupply: string;
  tokenAAdjustedFdvSupply: string;
  tokenAGraduationEth: string;
  tokenASqrtPriceX96: string | null;
  tokenARealEth: string | null;
  tokenAReserve: string | null;
  tokenACumulativeVolume: string | null;
  tokenAResidual: string | null;
  tokenAProjectedResidual: string;
  tokenACurveStatus: number;
  tokenAPoolId: string | null;
  tokenAGraduationDisabled: boolean;
  tokenAVolume24h: string;
  tokenATrades24h: number;
  tokenATraderCount: number;
  tokenAPriceHistory: string[] | null;
  tokenBTotalSupply: string;
  tokenBCirculatingSupply: string;
  tokenBAdjustedFdvSupply: string;
  tokenBGraduationEth: string;
  tokenBSqrtPriceX96: string | null;
  tokenBRealEth: string | null;
  tokenBReserve: string | null;
  tokenBCumulativeVolume: string | null;
  tokenBResidual: string | null;
  tokenBProjectedResidual: string;
  tokenBCurveStatus: number;
  tokenBPoolId: string | null;
  tokenBGraduationDisabled: boolean;
  tokenBVolume24h: string;
  tokenBTrades24h: number;
  tokenBTraderCount: number;
  tokenBPriceHistory: string[] | null;
  versusTraderCount: number;
  versusHolderCount: number;
};

type IndexedDebateOptions = {
  limit?: number;
  versusId?: string;
  watchlistUserId?: string;
  versusIds?: string[];
};

type IndexedDebateIdRow = {
  versusId: string;
};

function isoTimestamp(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("The indexed versus has an invalid creation timestamp.");
  return date.toISOString();
}

function creatorLabel(wallet: string) {
  return wallet.length > 12 ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : wallet;
}

type IndexedCampMarket = {
  totalSupply: string;
  circulatingSupply: string;
  adjustedFdvSupply: string;
  graduationEth: string;
  sqrtPriceX96: string | null;
  realEth: string | null;
  reserve: string | null;
  cumulativeVolume: string | null;
  residual: string | null;
  projectedResidual: string;
  curveStatus: number;
  graduationDisabled: boolean;
  volume24h: string;
  trades24h: number;
  traderCount: number;
  priceHistory: string[] | null;
};

function campMarket(input: IndexedCampMarket, quoteUsd: number | null) {
  const priceEth = unitsNumber(tokenPriceWad(input.sqrtPriceX96));
  const marketCapEth = unitsNumber(marketValueWei(input.sqrtPriceX96, input.circulatingSupply));
  const fdvEth = unitsNumber(marketValueWei(input.sqrtPriceX96, input.adjustedFdvSupply));
  const volume24hEth = unitsNumber(input.volume24h) ?? 0;
  const priceHistoryEth = (input.priceHistory ?? [])
    .slice()
    .reverse()
    .flatMap((sqrtPrice) => {
      const price = unitsNumber(tokenPriceWad(sqrtPrice));
      return price === null ? [] : [price];
    });
  const multiplier = quoteUsd ?? 1;
  const displayedHistory = priceHistoryEth.map((price) => price * multiplier);
  const totalSupply = unitsNumber(input.totalSupply) ?? 0;
  const circulatingSupply = unitsNumber(input.circulatingSupply) ?? 0;
  const lockedSupply = unitsNumber(input.residual ?? input.projectedResidual) ?? 0;
  const realEth = unitsNumber(input.realEth) ?? 0;
  const graduationEth = unitsNumber(input.graduationEth) ?? 0;
  const reserve = unitsNumber(input.reserve) ?? totalSupply;

  return {
    priceEth,
    priceUsd: priceEth !== null && quoteUsd !== null ? priceEth * quoteUsd : undefined,
    marketCapEth,
    marketCap: marketCapEth === null ? undefined : marketCapEth * multiplier,
    fdvEth,
    fdv: fdvEth === null ? undefined : fdvEth * multiplier,
    volume24hEth,
    volume24h: volume24hEth * multiplier,
    totalSupply,
    circulatingSupply,
    lockedSupply,
    realEth,
    graduationTargetEth: graduationEth,
    reserve,
    cumulativeVolumeEth: unitsNumber(input.cumulativeVolume) ?? 0,
    curveStatus: input.curveStatus,
    graduationDisabled: input.graduationDisabled,
    graduationProgress: input.curveStatus === 3
      ? 100
      : graduationEth > 0
        ? Math.max(0, Math.min(100, (realEth / graduationEth) * 100))
        : 0,
    trades24h: input.trades24h,
    traderCount: input.traderCount,
    priceHistory: displayedHistory,
    change24h: percentageChange(displayedHistory),
  };
}

function toDebate(row: IndexedDebateRow, quoteUsd: number | null): Debate | null {
  const id = Number(row.versusId);
  if (!Number.isSafeInteger(id) || id < 0) {
    console.error(`Indexed versus ${row.versusId} cannot be represented safely by the current frontend ID contract.`);
    return null;
  }

  const createdAt = isoTimestamp(row.createdAt);
  const createdAtTimestamp = Date.parse(createdAt);
  const createdMinutesAgo = Math.max(0, Math.floor((Date.now() - createdAtTimestamp) / 60_000));
  const imageA = publicAssetUrl(row.tokenAUri);
  const imageB = publicAssetUrl(row.tokenBUri);
  const marketA = campMarket({
    totalSupply: row.tokenATotalSupply,
    circulatingSupply: row.tokenACirculatingSupply,
    adjustedFdvSupply: row.tokenAAdjustedFdvSupply,
    graduationEth: row.tokenAGraduationEth,
    sqrtPriceX96: row.tokenASqrtPriceX96,
    realEth: row.tokenARealEth,
    reserve: row.tokenAReserve,
    cumulativeVolume: row.tokenACumulativeVolume,
    residual: row.tokenAResidual,
    projectedResidual: row.tokenAProjectedResidual,
    curveStatus: row.tokenACurveStatus,
    graduationDisabled: row.tokenAGraduationDisabled,
    volume24h: row.tokenAVolume24h,
    trades24h: row.tokenATrades24h,
    traderCount: row.tokenATraderCount,
    priceHistory: row.tokenAPriceHistory,
  }, quoteUsd);
  const marketB = campMarket({
    totalSupply: row.tokenBTotalSupply,
    circulatingSupply: row.tokenBCirculatingSupply,
    adjustedFdvSupply: row.tokenBAdjustedFdvSupply,
    graduationEth: row.tokenBGraduationEth,
    sqrtPriceX96: row.tokenBSqrtPriceX96,
    realEth: row.tokenBRealEth,
    reserve: row.tokenBReserve,
    cumulativeVolume: row.tokenBCumulativeVolume,
    residual: row.tokenBResidual,
    projectedResidual: row.tokenBProjectedResidual,
    curveStatus: row.tokenBCurveStatus,
    graduationDisabled: row.tokenBGraduationDisabled,
    volume24h: row.tokenBVolume24h,
    trades24h: row.tokenBTrades24h,
    traderCount: row.tokenBTraderCount,
    priceHistory: row.tokenBPriceHistory,
  }, quoteUsd);
  const totalMarketCap = (marketA.marketCap ?? 0) + (marketB.marketCap ?? 0);
  const sideAPercentage = totalMarketCap > 0
    ? Math.round(((marketA.marketCap ?? 0) / totalMarketCap) * 100)
    : 50;
  const creatorBadge = calculateBadgeProgress({
    versusCreated: row.creatorVersusCreated,
    creatorVolumeUsd: quoteUsd === null ? null : (unitsNumber(row.creatorVolumeWei) ?? 0) * quoteUsd,
    tradeCount: 0,
    tradedVolumeUsd: null,
    referralCount: 0,
    referredVolumeUsd: null,
  }).creator;

  return {
    id,
    title: row.title,
    description: row.description,
    socialsJson: row.socialsJson,
    sideA: row.tokenAName,
    sideB: row.tokenBName,
    category: row.category,
    sideAPercentage,
    volume24h: marketA.volume24h + marketB.volume24h,
    liquidity: 0,
    trades24h: marketA.trades24h + marketB.trades24h,
    participantCount: row.versusTraderCount,
    holderCount: row.versusHolderCount,
    createdMinutesAgo,
    marketCapA: marketA.marketCap,
    marketCapB: marketB.marketCap,
    quoteSymbol: "ETH",
    quoteUsd: quoteUsd ?? undefined,
    marketCurrency: quoteUsd === null ? "ETH" : "USD",
    imageA,
    imageB,
    tokenASymbol: row.tokenASymbol,
    tokenBSymbol: row.tokenBSymbol,
    changeA24h: marketA.change24h,
    changeB24h: marketB.change24h,
    createdAt,
    createdAtUtc: createdAt,
    createdAtTimestamp,
    launchedAt: createdAt,
    launchedAtUtc: createdAt,
    launchTimestamp: createdAtTimestamp,
    creatorName: row.creatorDisplayName?.trim() || creatorLabel(row.creatorWallet),
    creatorAddress: row.creatorWallet,
    feeRecipientA: row.feeRecipientA,
    feeRecipientB: row.feeRecipientB,
    creatorIsNew: row.creatorIsNew,
    creatorRankLabel: creatorBadge?.name,
    creatorRankClass: creatorBadge?.className,
    tokenA: {
      id: `${row.chainId}:${row.versusId}:0`,
      name: row.tokenAName,
      symbol: row.tokenASymbol,
      slug: row.tokenASymbol.toLowerCase(),
      address: row.tokenAAddress,
      chainId: row.chainId,
      chainName: KORUM_CHAIN.name,
      decimals: 18,
      image: imageA,
      imageRef: imageA,
      creatorAddress: row.creatorWallet,
      launchedAt: createdAt,
      launchedAtUtc: createdAt,
      launchTimestamp: createdAtTimestamp,
      createdAt,
      createdAtUtc: createdAt,
      createdAtTimestamp,
      price: marketA.priceEth ?? undefined,
      priceEth: marketA.priceEth ?? undefined,
      priceUsd: marketA.priceUsd,
      supply: marketA.totalSupply,
      circulatingSupply: marketA.circulatingSupply,
      lockedSupply: marketA.lockedSupply,
      marketCap: marketA.marketCap,
      marketCapEth: marketA.marketCapEth ?? undefined,
      fdv: marketA.fdv,
      fdvEth: marketA.fdvEth ?? undefined,
      quoteSymbol: "ETH",
      quoteUsd: quoteUsd ?? undefined,
      marketCurrency: quoteUsd === null ? "ETH" : "USD",
      curveStatus: marketA.curveStatus,
      poolId: row.tokenAPoolId ?? undefined,
      graduationDisabled: marketA.graduationDisabled,
      graduationProgress: marketA.graduationProgress,
      curveRealEth: marketA.realEth,
      graduationTargetEth: marketA.graduationTargetEth,
      curveTokenReserve: marketA.reserve,
      cumulativeVolumeEth: marketA.cumulativeVolumeEth,
      liquidity: 0,
      volume24h: marketA.volume24h,
      volume24hEth: marketA.volume24hEth,
      traderCount: marketA.traderCount,
      trades24h: marketA.trades24h,
      buys24h: 0,
      sells24h: 0,
      change24h: marketA.change24h,
      change5m: 0,
      change1h: 0,
      change6h: 0,
      priceHistory: marketA.priceHistory,
    },
    tokenB: {
      id: `${row.chainId}:${row.versusId}:1`,
      name: row.tokenBName,
      symbol: row.tokenBSymbol,
      slug: row.tokenBSymbol.toLowerCase(),
      address: row.tokenBAddress,
      chainId: row.chainId,
      chainName: KORUM_CHAIN.name,
      decimals: 18,
      image: imageB,
      imageRef: imageB,
      creatorAddress: row.creatorWallet,
      launchedAt: createdAt,
      launchedAtUtc: createdAt,
      launchTimestamp: createdAtTimestamp,
      createdAt,
      createdAtUtc: createdAt,
      createdAtTimestamp,
      price: marketB.priceEth ?? undefined,
      priceEth: marketB.priceEth ?? undefined,
      priceUsd: marketB.priceUsd,
      supply: marketB.totalSupply,
      circulatingSupply: marketB.circulatingSupply,
      lockedSupply: marketB.lockedSupply,
      marketCap: marketB.marketCap,
      marketCapEth: marketB.marketCapEth ?? undefined,
      fdv: marketB.fdv,
      fdvEth: marketB.fdvEth ?? undefined,
      quoteSymbol: "ETH",
      quoteUsd: quoteUsd ?? undefined,
      marketCurrency: quoteUsd === null ? "ETH" : "USD",
      curveStatus: marketB.curveStatus,
      poolId: row.tokenBPoolId ?? undefined,
      graduationDisabled: marketB.graduationDisabled,
      graduationProgress: marketB.graduationProgress,
      curveRealEth: marketB.realEth,
      graduationTargetEth: marketB.graduationTargetEth,
      curveTokenReserve: marketB.reserve,
      cumulativeVolumeEth: marketB.cumulativeVolumeEth,
      liquidity: 0,
      volume24h: marketB.volume24h,
      volume24hEth: marketB.volume24hEth,
      traderCount: marketB.traderCount,
      trades24h: marketB.trades24h,
      buys24h: 0,
      sells24h: 0,
      change24h: marketB.change24h,
      change5m: 0,
      change1h: 0,
      change6h: 0,
      priceHistory: marketB.priceHistory,
    },
  };
}

async function readIndexedDebates({ limit = DEFAULT_LIMIT, versusId, watchlistUserId, versusIds }: IndexedDebateOptions = {}) {
  const database = getDatabase();
  const safeLimit = Math.min(MAX_LIMIT, Math.max(1, Math.trunc(limit)));
  const normalizedVersusIds = versusIds?.filter((id) => /^\d{1,78}$/.test(id)).slice(0, MAX_LIMIT);
  const watchlistJoin = watchlistUserId ? `
    INNER JOIN ${WATCHLIST_TABLE} watchlist
      ON watchlist.chain_id = v.chain_id
      AND watchlist.versus_id = v.versus_id
      AND watchlist.user_id = $2::uuid
  ` : "";
  const versusPredicate = versusId ? "AND v.versus_id = $2::numeric" : "";
  const versusIdsPredicate = normalizedVersusIds?.length
    ? "AND v.versus_id = ANY(string_to_array($2, ',')::numeric[])"
    : "";
  const parameters: Array<string | number> = normalizedVersusIds?.length
    ? [KORUM_CHAIN_ID, normalizedVersusIds.join(","), safeLimit]
    : versusId
    ? [KORUM_CHAIN_ID, versusId, safeLimit]
    : watchlistUserId
      ? [KORUM_CHAIN_ID, watchlistUserId, safeLimit]
      : [KORUM_CHAIN_ID, safeLimit];
  const limitParameter = normalizedVersusIds?.length || versusId || watchlistUserId ? "$3" : "$2";
  const orderBy = watchlistUserId
    ? "watchlist.added_at DESC"
    : "v.created_at DESC, v.versus_id DESC";

  const rowsPromise = database.unsafe<IndexedDebateRow[]>(`
    SELECT
      v.chain_id::INTEGER AS "chainId",
      v.versus_id::TEXT AS "versusId",
      v.title,
      v.description,
      v.category,
      COALESCE(social_override.socials_json, v.socials_json) AS "socialsJson",
      v.creator_wallet AS "creatorWallet",
      fee_a.current_recipient AS "feeRecipientA",
      fee_b.current_recipient AS "feeRecipientB",
      NULLIF(BTRIM(creator.display_name), '') AS "creatorDisplayName",
      COALESCE(creator.created_at > NOW() - INTERVAL '7 days', FALSE) AS "creatorIsNew",
      COALESCE(creator_stats.versus_created, 0)::INTEGER AS "creatorVersusCreated",
      COALESCE(creator_stats.generated_volume_wei, 0)::TEXT AS "creatorVolumeWei",
      v.created_at AS "createdAt",
      camp_a.token_address AS "tokenAAddress",
      camp_a.name AS "tokenAName",
      camp_a.symbol AS "tokenASymbol",
      camp_a.uri AS "tokenAUri",
      camp_b.token_address AS "tokenBAddress",
      camp_b.name AS "tokenBName",
      camp_b.symbol AS "tokenBSymbol",
      camp_b.uri AS "tokenBUri",
      market_a.total_supply::TEXT AS "tokenATotalSupply",
      market_a.circulating_supply::TEXT AS "tokenACirculatingSupply",
      market_a.adjusted_fdv_supply::TEXT AS "tokenAAdjustedFdvSupply",
      market_a.graduation_eth::TEXT AS "tokenAGraduationEth",
      market_a.sqrt_price_x96_after::TEXT AS "tokenASqrtPriceX96",
      market_a.real_eth_after::TEXT AS "tokenARealEth",
      market_a.token_reserve_after::TEXT AS "tokenAReserve",
      market_a.cumulative_volume_after::TEXT AS "tokenACumulativeVolume",
      market_a.token_residual::TEXT AS "tokenAResidual",
      market_a.projected_token_residual::TEXT AS "tokenAProjectedResidual",
      market_a.curve_status::INTEGER AS "tokenACurveStatus",
      graduation_a.pool_id AS "tokenAPoolId",
      market_a.graduation_disabled AS "tokenAGraduationDisabled",
      stats_a.volume_24h AS "tokenAVolume24h",
      stats_a.trades_24h AS "tokenATrades24h",
      stats_a.trader_count AS "tokenATraderCount",
      stats_a.price_history AS "tokenAPriceHistory",
      market_b.total_supply::TEXT AS "tokenBTotalSupply",
      market_b.circulating_supply::TEXT AS "tokenBCirculatingSupply",
      market_b.adjusted_fdv_supply::TEXT AS "tokenBAdjustedFdvSupply",
      market_b.graduation_eth::TEXT AS "tokenBGraduationEth",
      market_b.sqrt_price_x96_after::TEXT AS "tokenBSqrtPriceX96",
      market_b.real_eth_after::TEXT AS "tokenBRealEth",
      market_b.token_reserve_after::TEXT AS "tokenBReserve",
      market_b.cumulative_volume_after::TEXT AS "tokenBCumulativeVolume",
      market_b.token_residual::TEXT AS "tokenBResidual",
      market_b.projected_token_residual::TEXT AS "tokenBProjectedResidual",
      market_b.curve_status::INTEGER AS "tokenBCurveStatus",
      graduation_b.pool_id AS "tokenBPoolId",
      market_b.graduation_disabled AS "tokenBGraduationDisabled",
      stats_b.volume_24h AS "tokenBVolume24h",
      stats_b.trades_24h AS "tokenBTrades24h",
      stats_b.trader_count AS "tokenBTraderCount",
      stats_b.price_history AS "tokenBPriceHistory",
      stats_versus.trader_count AS "versusTraderCount",
      (
        SELECT COUNT(DISTINCT position.trader_address)::INTEGER
        FROM ${INDEXER_SCHEMA}.trader_positions position
        WHERE position.chain_id = v.chain_id
          AND position.token_address IN (camp_a.token_address, camp_b.token_address)
          AND position.net_token_amount > 0
          AND position.trader_address <> '0x0000000000000000000000000000000000000000'
      ) AS "versusHolderCount"
    FROM ${INDEXER_SCHEMA}.versuses v
    LEFT JOIN public.versus_socials_overrides social_override
      ON social_override.chain_id = v.chain_id AND social_override.versus_id = v.versus_id
    LEFT JOIN users creator
      ON LOWER(creator.evm_wallet) = LOWER(v.creator_wallet)
    LEFT JOIN LATERAL (
      SELECT
        COUNT(DISTINCT created.versus_id)::INTEGER AS versus_created,
        COALESCE(SUM(COALESCE(creator_market.cumulative_volume_after, 0)), 0) AS generated_volume_wei
      FROM ${INDEXER_SCHEMA}.versuses created
      LEFT JOIN ${INDEXER_SCHEMA}.versus_camps creator_camp
        ON creator_camp.chain_id = created.chain_id AND creator_camp.versus_id = created.versus_id
      LEFT JOIN ${INDEXER_SCHEMA}.camp_market_state creator_market
        ON creator_market.chain_id = creator_camp.chain_id AND creator_market.token_address = creator_camp.token_address
      WHERE created.chain_id = v.chain_id AND created.creator_wallet = v.creator_wallet
    ) creator_stats ON TRUE
    ${watchlistJoin}
    INNER JOIN ${INDEXER_SCHEMA}.versus_camps camp_a
      ON camp_a.chain_id = v.chain_id
      AND camp_a.versus_id = v.versus_id
      AND camp_a.side = 0
    INNER JOIN ${INDEXER_SCHEMA}.versus_camps camp_b
      ON camp_b.chain_id = v.chain_id
      AND camp_b.versus_id = v.versus_id
      AND camp_b.side = 1
    INNER JOIN ${INDEXER_SCHEMA}.camp_fee_recipients fee_a
      ON fee_a.chain_id = camp_a.chain_id AND fee_a.token_address = camp_a.token_address
    INNER JOIN ${INDEXER_SCHEMA}.camp_fee_recipients fee_b
      ON fee_b.chain_id = camp_b.chain_id AND fee_b.token_address = camp_b.token_address
    INNER JOIN ${INDEXER_SCHEMA}.camp_market_state market_a
      ON market_a.chain_id = camp_a.chain_id
      AND market_a.token_address = camp_a.token_address
    INNER JOIN ${INDEXER_SCHEMA}.camp_market_state market_b
      ON market_b.chain_id = camp_b.chain_id
      AND market_b.token_address = camp_b.token_address
    LEFT JOIN ${INDEXER_SCHEMA}.camp_graduations graduation_a
      ON graduation_a.chain_id = camp_a.chain_id AND graduation_a.token_address = camp_a.token_address
    LEFT JOIN ${INDEXER_SCHEMA}.camp_graduations graduation_b
      ON graduation_b.chain_id = camp_b.chain_id AND graduation_b.token_address = camp_b.token_address
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(trade.eth_gross) FILTER (
          WHERE trade.traded_at >= NOW() - INTERVAL '24 hours'
        ), 0)::TEXT AS volume_24h,
        COUNT(*) FILTER (
          WHERE trade.traded_at >= NOW() - INTERVAL '24 hours'
        )::INTEGER AS trades_24h,
        COUNT(DISTINCT NULLIF(trade.trader_address, '0x0000000000000000000000000000000000000000'))::INTEGER AS trader_count,
        ARRAY(
          SELECT history.sqrt_price_x96_after::TEXT
          FROM ${INDEXER_SCHEMA}.camp_trades history
          WHERE history.chain_id = camp_a.chain_id
            AND history.token_address = camp_a.token_address
            AND history.traded_at >= NOW() - INTERVAL '24 hours'
          ORDER BY history.block_number DESC, history.log_index DESC
          LIMIT 96
        ) AS price_history
      FROM ${INDEXER_SCHEMA}.camp_trades trade
      WHERE trade.chain_id = camp_a.chain_id
        AND trade.token_address = camp_a.token_address
    ) stats_a ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(trade.eth_gross) FILTER (
          WHERE trade.traded_at >= NOW() - INTERVAL '24 hours'
        ), 0)::TEXT AS volume_24h,
        COUNT(*) FILTER (
          WHERE trade.traded_at >= NOW() - INTERVAL '24 hours'
        )::INTEGER AS trades_24h,
        COUNT(DISTINCT NULLIF(trade.trader_address, '0x0000000000000000000000000000000000000000'))::INTEGER AS trader_count,
        ARRAY(
          SELECT history.sqrt_price_x96_after::TEXT
          FROM ${INDEXER_SCHEMA}.camp_trades history
          WHERE history.chain_id = camp_b.chain_id
            AND history.token_address = camp_b.token_address
            AND history.traded_at >= NOW() - INTERVAL '24 hours'
          ORDER BY history.block_number DESC, history.log_index DESC
          LIMIT 96
        ) AS price_history
      FROM ${INDEXER_SCHEMA}.camp_trades trade
      WHERE trade.chain_id = camp_b.chain_id
        AND trade.token_address = camp_b.token_address
    ) stats_b ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(DISTINCT NULLIF(trade.trader_address, '0x0000000000000000000000000000000000000000'))::INTEGER AS trader_count
      FROM ${INDEXER_SCHEMA}.camp_trades trade
      WHERE trade.chain_id = v.chain_id
        AND trade.token_address IN (camp_a.token_address, camp_b.token_address)
    ) stats_versus ON TRUE
    WHERE v.chain_id = $1
      ${versusPredicate}
      ${versusIdsPredicate}
    ORDER BY ${orderBy}
    LIMIT ${limitParameter}
  `, parameters);

  const [rows, quote] = await Promise.all([rowsPromise, getEthUsdQuote()]);

  return rows
    .map((row) => toDebate(row, quote?.value ?? null))
    .filter((debate): debate is Debate => debate !== null);
}

async function getCachedIndexedDebates(limit: number, diagnostic?: CacheDiagnostic) {
  const safeLimit = Math.min(MAX_LIMIT, Math.max(1, Math.trunc(limit)));
  return rememberJson(
    redisCacheKey("debates", "list", safeLimit),
    INDEXED_DEBATES_CACHE_SECONDS,
    () => readIndexedDebates({ limit: safeLimit }),
    diagnostic,
  );
}

export const getIndexedDebates = cache((limit = DEFAULT_LIMIT) => getCachedIndexedDebates(limit));

export function getIndexedDebatesWithDiagnostic(diagnostic: CacheDiagnostic, limit = DEFAULT_LIMIT) {
  return getCachedIndexedDebates(limit, diagnostic);
}

async function searchIndexedDebateIds(searchQuery: string, limit: number) {
  const database = getDatabase();
  return database.unsafe<IndexedDebateIdRow[]>(`
    SELECT v.versus_id::TEXT AS "versusId"
    FROM ${INDEXER_SCHEMA}.versuses v
    INNER JOIN ${INDEXER_SCHEMA}.versus_camps camp_a
      ON camp_a.chain_id = v.chain_id
      AND camp_a.versus_id = v.versus_id
      AND camp_a.side = 0
    INNER JOIN ${INDEXER_SCHEMA}.versus_camps camp_b
      ON camp_b.chain_id = v.chain_id
      AND camp_b.versus_id = v.versus_id
      AND camp_b.side = 1
    WHERE v.chain_id = $1
      AND (
        STRPOS(LOWER(v.title), $2) > 0
        OR STRPOS(LOWER(v.description), $2) > 0
        OR STRPOS(LOWER(v.category), $2) > 0
        OR STRPOS(v.versus_id::TEXT, $2) > 0
        OR STRPOS(LOWER(camp_a.name), $2) > 0
        OR STRPOS(LOWER(camp_a.symbol), $2) > 0
        OR STRPOS(LOWER(camp_b.name), $2) > 0
        OR STRPOS(LOWER(camp_b.symbol), $2) > 0
      )
    ORDER BY
      CASE
        WHEN LOWER(v.title) = $2 THEN 0
        WHEN LOWER(camp_a.symbol) = $2 OR LOWER(camp_b.symbol) = $2 THEN 1
        WHEN LOWER(camp_a.name) = $2 OR LOWER(camp_b.name) = $2 THEN 2
        ELSE 3
      END,
      v.created_at DESC,
      v.versus_id DESC
    LIMIT $3
  `, [KORUM_CHAIN_ID, searchQuery, limit]);
}

export function searchIndexedDebatesWithDiagnostic(
  searchQuery: string,
  diagnostic?: CacheDiagnostic,
  limit = INDEXED_DEBATE_SEARCH_LIMIT,
) {
  const normalizedSearch = searchQuery.trim().replace(/\s+/g, " ").slice(0, 100).toLocaleLowerCase("en-US");
  if (normalizedSearch.length < 2) return Promise.resolve([]);
  const safeLimit = Math.min(INDEXED_DEBATE_SEARCH_LIMIT, Math.max(1, Math.trunc(limit)));

  return rememberJson(
    redisCacheKey("debates", "search-v2", normalizedSearch, safeLimit),
    INDEXED_DEBATE_SEARCH_CACHE_SECONDS,
    async () => {
      const matches = await searchIndexedDebateIds(normalizedSearch, safeLimit);
      const versusIds = matches.map((match) => match.versusId);
      if (versusIds.length === 0) return [];

      const debates = await readIndexedDebates({ limit: versusIds.length, versusIds });
      const debateById = new Map(debates.map((debate) => [String(debate.id), debate]));
      return versusIds.flatMap((versusId) => {
        const debate = debateById.get(versusId);
        return debate ? [debate] : [];
      });
    },
    diagnostic,
  );
}

async function getCachedIndexedDebateById(versusId: string, diagnostic?: CacheDiagnostic) {
  if (!/^\d{1,78}$/.test(versusId)) return null;
  return rememberJson(
    redisCacheKey("debates", "detail", versusId),
    INDEXED_DEBATES_CACHE_SECONDS,
    async () => {
      const debates = await readIndexedDebates({ limit: 1, versusId });
      return debates[0] ?? null;
    },
    diagnostic,
  );
}

export const getIndexedDebateById = cache((versusId: string) => getCachedIndexedDebateById(versusId));

export function getIndexedDebateByIdWithDiagnostic(versusId: string, diagnostic: CacheDiagnostic) {
  return getCachedIndexedDebateById(versusId, diagnostic);
}

export async function getIndexedWatchlistDebates(userId: string) {
  return readIndexedDebates({ limit: MAX_LIMIT, watchlistUserId: userId });
}
