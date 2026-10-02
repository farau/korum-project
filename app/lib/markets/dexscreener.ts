import "server-only";

import { connectedRedis, consumeRateLimit, readJson, redisCacheKey, writeJson } from "../cache/redis";
import { verifiedDexscreenerChart, type PoolChart, type TokenVenue } from "./venue";

const pending: PoolChart = { status: "pending", url: null, embedUrl: null };
const local = new Map<string, { expiresAt: number; value: PoolChart }>();
const inflight = new Map<string, Promise<PoolChart>>();

// Positive discoveries last an hour; missing pools and API failures retry after
// 30 seconds. The memory fallback also protects localhost without Redis.
export async function getDexscreenerChart(venue: TokenVenue): Promise<PoolChart> {
  if (venue.chainId !== 4663) return { status: "unsupported", url: null, embedUrl: null };
  if (venue.curveStatus !== 3 || !/^0x[\da-f]{64}$/i.test(venue.poolId ?? "")) return pending;
  const key = redisCacheKey("dexscreener", "pool-v1", venue.chainId, venue.tokenAddress, venue.poolId!.toLowerCase());
  const remembered = local.get(key);
  if (remembered && remembered.expiresAt > Date.now()) return remembered.value;
  const running = inflight.get(key);
  if (running) return running;
  const load = async () => {
    const cached = await readJson<PoolChart>(key);
    if (cached.hit) return cached.value;
    const redis = await connectedRedis();
    // A short lease coalesces first discovery across replicas. It expires even
    // if the process crashes; other requests show the pending state meanwhile.
    if (redis) {
      try {
        if (await redis.set(`${key}:checking`, "1", "EX", 10, "NX") !== "OK") return pending;
      } catch { /* The local coalescing and rate limit still apply. */ }
    }
    let value = pending;
    try {
      const budget = await consumeRateLimit(redisCacheKey("dexscreener", "requests"), 1, 240, 60);
      if (budget.allowed) {
        const response = await fetch(`https://api.dexscreener.com/latest/dex/pairs/robinhood/${venue.poolId!.toLowerCase()}`, {
          cache: "no-store", signal: AbortSignal.timeout(5_000),
        });
        if (response.ok) value = verifiedDexscreenerChart(await response.json(), venue) ?? pending;
      }
    } catch { /* Discovery failure does not affect trading or analytics. */ }
    await writeJson(key, value, value.status === "ready" ? 3600 : 30);
    return value;
  };
  const promise = load().then(value => {
    const expiresAt = Date.now() + (value.status === "ready" ? 3600 : 30) * 1000;
    local.set(key, { value, expiresAt });
    if (local.size > 1000) for (const [key, item] of local) if (item.expiresAt <= Date.now()) local.delete(key);
    while (local.size > 1000) local.delete(local.keys().next().value!);
    return value;
  }).finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}
