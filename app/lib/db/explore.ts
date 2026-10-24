import "server-only";
import { INDEXER_SCHEMA } from "../../config/deployment";
import { KORUM_CHAIN_ID } from "../../config/korum-network";
import { connectedRedis, redisCacheKey, rememberJson, type CacheDiagnostic } from "../cache/redis";
import { readMaintained } from "../cache/maintained";
import { getEthUsdQuote } from "../markets/quote-usd";
import { marketValueWei, unitsNumber } from "../markets/math";
import { DEFAULT_EXPLORE_OPTIONS, EXPLORE_PAGE_SIZE, exploreItem, normalizeCategory, type ExploreOptions, type ExplorePage } from "../explore-page";
import { getDatabase } from "./client";
import { getIndexedDebatesByIds, reconcileIndexedMarkets } from "./debates";
import { exploreRankingKeys } from "../live/explore-cache";

export type RankRow = { id: string; category: string; createdAt: string; traders: number; tokens: string[]; camps: [string | null, string][]; volumes: [number, string][] };
// A shared compact ranking projection, never full Debate objects for all markets.
// Prefix volumes slide through quiet periods without age-triggered SQL reloads.
export async function loadExploreRanks(tokens?: string[]): Promise<RankRow[]> {
  return getDatabase().unsafe<RankRow[]>(`
    WITH markets AS MATERIALIZED (
      SELECT chain_id, versus_id, side, token_address, sqrt_price_x96_after, circulating_supply
      FROM ${INDEXER_SCHEMA}.camp_market_state
      WHERE chain_id=$1 ${tokens ? `AND versus_id IN (SELECT versus_id FROM ${INDEXER_SCHEMA}.versuses
        WHERE chain_id=$1 AND (token_a_address=ANY($2::TEXT[]) OR token_b_address=ANY($2::TEXT[])))` : ""}
    ), eligible AS (
      SELECT v.chain_id, v.versus_id, v.category, v.created_at, ARRAY_AGG(m.token_address ORDER BY m.side) AS tokens,
        JSONB_AGG(JSONB_BUILD_ARRAY(m.sqrt_price_x96_after::TEXT, m.circulating_supply::TEXT) ORDER BY m.side) AS camps
      FROM ${INDEXER_SCHEMA}.versuses v
      JOIN markets m USING (chain_id, versus_id)
      WHERE v.chain_id=$1 AND v.versus_id BETWEEN 0 AND 9007199254740991
        ${tokens ? "AND (v.token_a_address = ANY($2::TEXT[]) OR v.token_b_address = ANY($2::TEXT[]))" : ""}
      GROUP BY v.chain_id,v.versus_id,v.category,v.created_at HAVING COUNT(*)=2
    )
    SELECT e.versus_id::TEXT AS id, e.category, e.created_at AS "createdAt", e.camps, e.tokens,
      (SELECT COUNT(DISTINCT membership.trader_address)::INTEGER
        FROM ${INDEXER_SCHEMA}.camp_trader_memberships membership
        WHERE membership.chain_id=e.chain_id AND membership.token_address=ANY(e.tokens)) AS traders,
      COALESCE((SELECT JSONB_AGG(JSONB_BUILD_ARRAY(EXTRACT(EPOCH FROM volume_window.traded_at),volume_window.volume::TEXT) ORDER BY volume_window.traded_at)
        FROM (SELECT bucket.traded_at, SUM(SUM(bucket.volume_wei)) OVER (ORDER BY bucket.traded_at) AS volume
          FROM ${INDEXER_SCHEMA}.camp_trade_buckets bucket
          WHERE bucket.chain_id=e.chain_id AND bucket.token_address=ANY(e.tokens) AND bucket.traded_at >= NOW()-INTERVAL '24 hours'
          GROUP BY bucket.traded_at) volume_window), '[]'::JSONB) AS volumes
    FROM eligible e ORDER BY e.versus_id DESC
  `, tokens ? [KORUM_CHAIN_ID, tokens] : [KORUM_CHAIN_ID]);
}
function volumeAt(rows: RankRow["volumes"], time: number, inclusive: boolean) {
  let low = 0, high = rows.length;
  while (low < high) { const mid = (low + high) >>> 1; if (rows[mid][0] < time || (inclusive && rows[mid][0] === time)) low = mid + 1; else high = mid; }
  return BigInt(rows[low - 1]?.[1] ?? "0");
}
export function selectExplorePage(rows: RankRow[], options: ExploreOptions, quoteUsd: number | null, now = Date.now()) {
  const multiplier = quoteUsd ?? 1;
  const maxAge = { all: Infinity, "1h": 3600_000, "24h": 86400_000, "7d": 7 * 86400_000 }[options.age];
  let ranked = rows.map(row => ({ ...row, created: new Date(row.createdAt).getTime(),
    marketCap: row.camps.reduce((sum, [sqrt, supply]) => sum + (unitsNumber(marketValueWei(sqrt, supply)) ?? 0), 0) * multiplier,
    volume: (unitsNumber((volumeAt(row.volumes, now / 1000, true) - volumeAt(row.volumes, now / 1000 - 86400, false)).toString()) ?? 0) * multiplier,
  })).filter(row => row.marketCap >= options.marketCapMin && row.traders >= options.tradersMin
    && Math.max(0, now - row.created) < maxAge
    && (["All", "HotTake"].includes(options.category) || normalizeCategory(row.category) === normalizeCategory(options.category)));
  const tie = (a: RankRow, b: RankRow) => BigInt(a.id) === BigInt(b.id) ? 0 : BigInt(a.id) > BigInt(b.id) ? -1 : 1;
  // Preserve HotTake semantics: the global top 12 by volume, then the chosen sort.
  if (options.category === "HotTake") ranked = ranked.sort((a, b) => b.volume - a.volume || tie(a, b)).slice(0, 12);
  ranked.sort((a, b) => (options.sort === "volume" ? b.volume - a.volume : options.sort === "holders" ? b.traders - a.traders
    : options.sort === "recent" ? b.created - a.created : b.marketCap - a.marketCap) || tie(a, b));
  const total = ranked.length, totalPages = Math.max(1, Math.ceil(total / EXPLORE_PAGE_SIZE));
  const page = Math.min(options.page, totalPages);
  return { ids: ranked.slice((page - 1) * EXPLORE_PAGE_SIZE, page * EXPLORE_PAGE_SIZE).map(row => row.id), page, total, totalPages, catalogTotal: rows.length };
}
async function rankingRows(diagnostic?: CacheDiagnostic) {
  if (process.env.REDIS_URL && (process.env.KORUM_GOLDSKY_WEBHOOK_SECRET?.length ?? 0) >= 32) {
    let redis;
    try { redis = await connectedRedis(); if (redis?.status === "ready") await reconcileIndexedMarkets(redis); }
    catch { redis = null; }
    if (redis?.status === "ready") {
      return readMaintained(redis, exploreRankingKeys(redisCacheKey), loadExploreRanks, diagnostic);
    }
  }
  return rememberJson(redisCacheKey("debates", "explore-ranking-fallback-v1"), 15, loadExploreRanks, diagnostic);
}
export async function getExplorePage(options: ExploreOptions = DEFAULT_EXPLORE_OPTIONS, diagnostic?: CacheDiagnostic): Promise<ExplorePage> {
  const [rows, quote] = await Promise.all([rankingRows(diagnostic), getEthUsdQuote()]);
  const { ids, ...pagination } = selectExplorePage(rows, options, quote?.value ?? null);
  const items = await getIndexedDebatesByIds(ids);
  const byId = new Map(items.map(item => [String(item.id), item]));
  return { ...pagination, items: ids.flatMap(id => byId.has(id) ? [exploreItem(byId.get(id)!)] : []) };
}
