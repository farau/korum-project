import "server-only";

import { cache } from "react";
import type { Debate } from "../debates";
import { getDatabase } from "./client";

const ROBINHOOD_TESTNET_CHAIN_ID = 46630;
const ROBINHOOD_TESTNET_NAME = "Robinhood Chain Testnet";
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 250;

type IndexedDebateRow = {
  chainId: number;
  versusId: string;
  title: string;
  description: string;
  category: string;
  socialsJson: string;
  creatorWallet: string;
  createdAt: Date | string;
  tokenAAddress: string;
  tokenAName: string;
  tokenASymbol: string;
  tokenAUri: string;
  tokenBAddress: string;
  tokenBName: string;
  tokenBSymbol: string;
  tokenBUri: string;
};

type IndexedDebateOptions = {
  limit?: number;
  versusId?: string;
};

function publicAssetUrl(uri: string) {
  if (uri.startsWith("ipfs://")) return `https://ipfs.io/ipfs/${uri.slice(7)}`;
  if (uri.startsWith("ar://")) return `https://arweave.net/${uri.slice(5)}`;
  if (/^https?:\/\//i.test(uri)) return uri;
  return undefined;
}

function isoTimestamp(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("The indexed versus has an invalid creation timestamp.");
  return date.toISOString();
}

function creatorLabel(wallet: string) {
  return wallet.length > 12 ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : wallet;
}

function toDebate(row: IndexedDebateRow): Debate | null {
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
  const flatHistory = [0, 0, 0, 0, 0, 0, 0];

  return {
    id,
    title: row.title,
    description: row.description,
    socialsJson: row.socialsJson,
    sideA: row.tokenAName,
    sideB: row.tokenBName,
    category: row.category,
    sideAPercentage: 50,
    volume24h: 0,
    liquidity: 0,
    trades24h: 0,
    participantCount: 0,
    holderCount: 0,
    createdMinutesAgo,
    marketCapA: 0,
    marketCapB: 0,
    imageA,
    imageB,
    tokenASymbol: row.tokenASymbol,
    tokenBSymbol: row.tokenBSymbol,
    changeA24h: 0,
    changeB24h: 0,
    createdAt,
    createdAtUtc: createdAt,
    createdAtTimestamp,
    launchedAt: createdAt,
    launchedAtUtc: createdAt,
    launchTimestamp: createdAtTimestamp,
    creatorName: creatorLabel(row.creatorWallet),
    creatorAddress: row.creatorWallet,
    creatorRankLabel: "CREATOR",
    creatorRankClass: "new",
    tokenA: {
      id: `${row.chainId}:${row.versusId}:0`,
      name: row.tokenAName,
      symbol: row.tokenASymbol,
      slug: row.tokenASymbol.toLowerCase(),
      address: row.tokenAAddress,
      chainId: row.chainId,
      chainName: ROBINHOOD_TESTNET_NAME,
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
      price: 0,
      priceUsd: 0,
      marketCap: 0,
      liquidity: 0,
      volume24h: 0,
      holders: 0,
      trades24h: 0,
      buys24h: 0,
      sells24h: 0,
      change24h: 0,
      change5m: 0,
      change1h: 0,
      change6h: 0,
      priceHistory: flatHistory,
    },
    tokenB: {
      id: `${row.chainId}:${row.versusId}:1`,
      name: row.tokenBName,
      symbol: row.tokenBSymbol,
      slug: row.tokenBSymbol.toLowerCase(),
      address: row.tokenBAddress,
      chainId: row.chainId,
      chainName: ROBINHOOD_TESTNET_NAME,
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
      price: 0,
      priceUsd: 0,
      marketCap: 0,
      liquidity: 0,
      volume24h: 0,
      holders: 0,
      trades24h: 0,
      buys24h: 0,
      sells24h: 0,
      change24h: 0,
      change5m: 0,
      change1h: 0,
      change6h: 0,
      priceHistory: flatHistory,
    },
  };
}

async function readIndexedDebates({ limit = DEFAULT_LIMIT, versusId }: IndexedDebateOptions = {}) {
  const database = getDatabase();
  const safeLimit = Math.min(MAX_LIMIT, Math.max(1, Math.trunc(limit)));
  const versusPredicate = versusId ? "AND v.versus_id = $2::numeric" : "";
  const parameters: Array<string | number> = versusId
    ? [ROBINHOOD_TESTNET_CHAIN_ID, versusId, safeLimit]
    : [ROBINHOOD_TESTNET_CHAIN_ID, safeLimit];
  const limitParameter = versusId ? "$3" : "$2";

  const rows = await database.unsafe<IndexedDebateRow[]>(`
    SELECT
      v.chain_id::INTEGER AS "chainId",
      v.versus_id::TEXT AS "versusId",
      v.title,
      v.description,
      v.category,
      v.socials_json AS "socialsJson",
      v.creator_wallet AS "creatorWallet",
      v.created_at AS "createdAt",
      camp_a.token_address AS "tokenAAddress",
      camp_a.name AS "tokenAName",
      camp_a.symbol AS "tokenASymbol",
      camp_a.uri AS "tokenAUri",
      camp_b.token_address AS "tokenBAddress",
      camp_b.name AS "tokenBName",
      camp_b.symbol AS "tokenBSymbol",
      camp_b.uri AS "tokenBUri"
    FROM indexer.versuses v
    INNER JOIN indexer.versus_camps camp_a
      ON camp_a.chain_id = v.chain_id
      AND camp_a.versus_id = v.versus_id
      AND camp_a.side = 0
    INNER JOIN indexer.versus_camps camp_b
      ON camp_b.chain_id = v.chain_id
      AND camp_b.versus_id = v.versus_id
      AND camp_b.side = 1
    WHERE v.chain_id = $1
      ${versusPredicate}
    ORDER BY v.created_at DESC, v.versus_id DESC
    LIMIT ${limitParameter}
  `, parameters);

  return rows.map(toDebate).filter((debate): debate is Debate => debate !== null);
}

export const getIndexedDebates = cache(async (limit = DEFAULT_LIMIT) => {
  return readIndexedDebates({ limit });
});

export const getIndexedDebateById = cache(async (versusId: string) => {
  if (!/^\d{1,78}$/.test(versusId)) return null;
  const debates = await readIndexedDebates({ limit: 1, versusId });
  return debates[0] ?? null;
});
