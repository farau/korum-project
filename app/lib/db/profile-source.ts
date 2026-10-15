import "server-only";
import { getAddress } from "viem";
import { INDEXER_SCHEMA } from "../../config/deployment";
import { KORUM_CHAIN_ID } from "../../config/korum-network";
import { connectedRedis, redisCacheKey, rememberJson, type CacheDiagnostic } from "../cache/redis";
import { MAINTAINED_IDLE_SECONDS, readMaintained } from "../cache/maintained";
import { activeProfileKey, profileSourceKeys, profileWalletHash } from "../live/profile-cache";
import { getDatabase } from "./client";
import { indexedDebateMetadataFingerprint } from "./debates";
import { reconcileDebateMetadata } from "../live/debate-reconcile";

export type ProfileStatsRow = {
  referralCount: number;
  activeReferralCount: number;
  versusCreated: number;
  versusJoined: number;
  tradeCount: number;
  tradedVolumeWei: string;
  creatorVolumeWei: string;
  referredVolumeWei: string;
};

export type ProfileTradePosition = {
  versusId: string;
  tokenAddress: `0x${string}`;
  tokenName: string;
  tokenSymbol: string;
  configId: number | string;
  netTokenAmount: string;
  netCashFlowWei: string;
};
export type ProfileSource = { stats: ProfileStatsRow | null; positions: ProfileTradePosition[] };

async function loadProfileSource(wallet: string): Promise<ProfileSource[]> {
  const database = getDatabase();
  const [rows, positions] = await Promise.all([
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
    database.unsafe<ProfileTradePosition[]>(`
      SELECT camp.versus_id::TEXT AS "versusId",
        position.token_address AS "tokenAddress", versus.config_id AS "configId",
        camp.name AS "tokenName", camp.symbol AS "tokenSymbol",
        position.net_token_amount::TEXT AS "netTokenAmount",
        position.net_cash_flow_wei::TEXT AS "netCashFlowWei"
      FROM ${INDEXER_SCHEMA}.trader_positions position
      JOIN ${INDEXER_SCHEMA}.versus_camps camp
        ON camp.chain_id = position.chain_id AND camp.token_address = position.token_address
      JOIN ${INDEXER_SCHEMA}.versuses versus
        ON versus.chain_id = camp.chain_id AND versus.versus_id = camp.versus_id
      WHERE position.chain_id = $1 AND position.trader_address = $2
      ORDER BY camp.versus_id DESC, camp.side ASC
    `, [KORUM_CHAIN_ID, wallet]),
  ]);
  return [{ stats: rows[0] ?? null, positions }];
}

// Without live delivery, a short, bounded fallback keeps local/degraded reads
// available. Live Redis uses idle retention and targeted event invalidation.
const fallback = new Map<string, { until: number; pending: Promise<ProfileSource[]> }>();
async function fallbackSource(wallet: string, diagnostic?: CacheDiagnostic) {
  const existing = fallback.get(wallet);
  if (existing && existing.until > Date.now()) return existing.pending;
  if (fallback.size >= 1000) fallback.delete(fallback.keys().next().value!);
  const pending = rememberJson(redisCacheKey("private", "profile-source-fallback-v1", profileWalletHash(wallet)),
    60, () => loadProfileSource(wallet), diagnostic).catch(error => { fallback.delete(wallet); throw error; });
  fallback.set(wallet, { until: Date.now() + 60_000, pending });
  return pending;
}

export async function getProfileSource(address: `0x${string}`, diagnostic?: CacheDiagnostic): Promise<ProfileSource> {
  const wallet = getAddress(address).toLowerCase();
  let redis;
  if (process.env.REDIS_URL && (process.env.KORUM_GOLDSKY_WEBHOOK_SECRET?.length ?? 0) >= 32) {
    try { redis = await connectedRedis(); } catch { /* Use the bounded fallback. */ }
  }
  if (!redis || redis.status !== "ready") return (await fallbackSource(wallet, diagnostic))[0];
  await reconcileDebateMetadata(redis, redisCacheKey, indexedDebateMetadataFingerprint);
  // Outlive a cold fill's 30s lease as well as its 10-minute idle retention.
  await redis.set(activeProfileKey(redisCacheKey), "1", "EX", MAINTAINED_IDLE_SECONDS + 30);
  return (await readMaintained(redis, profileSourceKeys(redisCacheKey, profileWalletHash(wallet)),
    () => loadProfileSource(wallet), diagnostic))[0];
}
