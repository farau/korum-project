import { randomUUID } from "node:crypto";
import type Redis from "ioredis";
import { compareCursor, mergeChartTrades, slideChart, type ChartSnapshot, type ChartTrade } from "./chart";

export const LIVE_CHART_RANGES = ["1s", "1m", "5m", "15m", "1h", "4h", "1d", "7d", "30d", "180d", "all"] as const;
export const LIVE_CHART_RETENTION_SECONDS = 600;
type Entry<T extends ChartSnapshot = ChartSnapshot> = { revision: string; builtAt: number; page: T };
type Key = (...parts: Array<string | number>) => string;
export function liveChartKey(key: Key, token: string, range: string) {
  return key("live", "chart-v1", token, range);
}
export function tokenRevisionKey(key: Key, token: string) {
  return key("live", "chart-revision", token);
}

export function parseChartEntry<T extends ChartSnapshot>(raw: string | null, revision: string): Entry<T> | null {
  if (!raw) return null;
  try {
    const entry = JSON.parse(raw) as Entry<T>;
    return entry.revision === revision && Number.isFinite(entry.builtAt)
      && Array.isArray(entry.page?.points) && entry.page.lastTradeCursor !== undefined
      ? entry : null;
  } catch { return null; }
}

const writeScript = `
if (redis.call('GET', KEYS[1]) or '0') ~= ARGV[1] then return 0 end
if redis.call('GET', KEYS[3]) ~= ARGV[3] then return 0 end
redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[4])
return 1
`;
const releaseScript = `
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0
`;
const readScript = `
local revision = redis.call('GET', KEYS[1]) or '0'
local page = redis.call('GET', KEYS[2])
if page then
  redis.call('EXPIRE', KEYS[2], ARGV[1])
  redis.call('EXPIRE', KEYS[1], 86400)
end
return { revision, page or '' }
`;

// The only PostgreSQL loader is supplied by the chart adapter. A Redis lease
// also coalesces cache reconstruction across application replicas.
async function loadLiveChart<T extends ChartSnapshot>(
  redis: Redis, key: Key, token: string, range: string,
  load: () => Promise<T>, diagnostic?: { status: "HIT" | "MISS" | "DEDUPED" | "BYPASS" },
): Promise<T> {
  const cacheKey = liveChartKey(key, token, range);
  const revisionKey = tokenRevisionKey(key, token);
  const lockKey = `${cacheKey}:loading`;
  const owner = randomUUID();
  const read = async () => {
    const result = await redis.eval(readScript, 2, revisionKey, cacheKey, LIVE_CHART_RETENTION_SECONDS) as string[];
    const revision = result[0];
    const entry = parseChartEntry<T>(result[1], revision);
    return { revision, entry };
  };
  let state = await read();
  if (state.entry) {
    if (diagnostic) diagnostic.status = "HIT";
    return slideChart(state.entry.page, Math.floor(Date.now() / 1000));
  }
  const deadline = Date.now() + 5_000;
  while (await redis.set(lockKey, owner, "EX", 15, "NX") !== "OK") {
    if (Date.now() >= deadline) {
      if (diagnostic) diagnostic.status = "BYPASS";
      return load();
    }
    await new Promise(resolve => setTimeout(resolve, 100));
    state = await read();
    if (state.entry) {
      if (diagnostic) diagnostic.status = "HIT";
      return slideChart(state.entry.page, Math.floor(Date.now() / 1000));
    }
  }
  try {
    // Another replica may have filled the cache just before releasing its lease.
    state = await read();
    if (state.entry) {
      if (diagnostic) diagnostic.status = "HIT";
      return slideChart(state.entry.page, Math.floor(Date.now() / 1000));
    }
    if (diagnostic) diagnostic.status = "MISS";
    for (let attempt = 0; attempt < 3; attempt++) {
      const builtAt = Date.now();
      const page = await load();
      const entry: Entry<T> = { revision: state.revision, builtAt, page };
      const stored = await redis.eval(writeScript, 3, revisionKey, cacheKey, lockKey,
        state.revision, JSON.stringify(entry), owner, LIVE_CHART_RETENTION_SECONDS);
      if (stored === 1) return page;
      // A trade/correction arrived during the read: never cache the old result.
      state = await read();
      if (state.entry) return slideChart(state.entry.page, Math.floor(Date.now() / 1000));
    }
    return load();
  } finally {
    await redis.eval(releaseScript, 1, lockKey, owner).catch(() => undefined);
  }
}

const inflight = new Map<string, Promise<ChartSnapshot>>();
export async function readLiveChart<T extends ChartSnapshot>(
  redis: Redis, key: Key, token: string, range: string,
  load: () => Promise<T>, diagnostic?: { status: "HIT" | "MISS" | "DEDUPED" | "BYPASS" },
): Promise<T> {
  const cacheKey = liveChartKey(key, token, range);
  const existing = inflight.get(cacheKey);
  if (existing) {
    if (diagnostic) diagnostic.status = "DEDUPED";
    return existing as Promise<T>;
  }
  const pending = loadLiveChart(redis, key, token, range, load, diagnostic)
    .finally(() => inflight.delete(cacheKey));
  inflight.set(cacheKey, pending);
  return pending;
}

export type ChartCacheMutation = { key: string; expected: string; value: string };
export async function prepareChartMutations(
  redis: Redis, key: Key, tokens: string[], revision: string, trades: ChartTrade[], reset: boolean, disabledTokens: string[] = [],
): Promise<{ mutations: ChartCacheMutation[]; revisions: string[] }> {
  const revisions = tokens.map(token => tokenRevisionKey(key, token));
  const charts = tokens.flatMap(token => LIVE_CHART_RANGES.map(range => ({ token, key: liveChartKey(key, token, range) })));
  const values = await redis.mget(...revisions, ...charts.map(chart => chart.key));
  const tokenRevisions = new Map(tokens.map((token, i) => [token, values[i] ?? "0"]));
  const byToken = new Map(tokens.map(token => [token, trades.filter(trade => trade.token === token)]));
  const mutations = charts.map((chart, i): ChartCacheMutation => {
    const raw = values[revisions.length + i];
    const entry = parseChartEntry(raw, tokenRevisions.get(chart.token)!);
    const tokenTrades = byToken.get(chart.token)!;
    // A previously unpublished insertion older than the snapshot cursor could
    // be a late projection missing from its historical OHLC. Rebuild safely.
    const olderInsertion = entry?.page.lastTradeCursor && tokenTrades.some(trade => compareCursor(trade.cursor, entry.page.lastTradeCursor!) < 0);
    const page = !reset && !disabledTokens.includes(chart.token) && !olderInsertion && entry ? mergeChartTrades(entry.page, tokenTrades, Math.floor(Date.now() / 1000)) : null;
    return {
      key: chart.key, expected: raw ?? "",
      value: page ? JSON.stringify({ ...entry, revision, page: { ...page, updatedAt: (page.lastTradeTimestamp ?? 0) * 1000 } }) : "",
    };
  });
  return { mutations, revisions };
}

// Atomically publish after moving the cached charts to the new token revision.
// Concurrent publishers retry; a concurrent rebuild remains on the old revision
// and therefore cannot be served. Incremental writes retain the idle TTL.
export const publishChartScript = `
local changed = false
for i = 1, tonumber(ARGV[4]) do
  if redis.call('GET', KEYS[2 + i]) ~= ARGV[4 + i] then changed = true end
end
if not changed then return 0 end
if (redis.call('GET', KEYS[1]) or '0') ~= ARGV[3] then return -1 end
local offset = 4 + tonumber(ARGV[4])
local revisions = cjson.decode(ARGV[offset + 1])
local mutations = cjson.decode(ARGV[offset + 2])
local mappings = cjson.decode(ARGV[offset + 3] or '[]')
for _, mutation in ipairs(mutations) do
  if mutation.value == '' then
    redis.call('DEL', mutation.key)
  elseif redis.call('GET', mutation.key) == mutation.expected then
    redis.call('SET', mutation.key, mutation.value, 'KEEPTTL')
  end
end
for _, key in ipairs(revisions) do redis.call('SET', key, ARGV[1], 'EX', 86400) end
for _, mapping in ipairs(mappings) do redis.call('SET', mapping.key, mapping.value, 'EX', 86400) end
for i = 1, tonumber(ARGV[4]) do
  redis.call('SET', KEYS[2 + i], ARGV[4 + i], 'EX', 86400)
end
redis.call('SET', KEYS[1], ARGV[1])
redis.call('PUBLISH', KEYS[2], ARGV[2])
return 1
`;
