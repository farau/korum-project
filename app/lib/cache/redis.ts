import "server-only";

import { randomUUID } from "node:crypto";
import Redis from "ioredis";

import { DEPLOYMENT_CACHE_SCOPE } from "../../config/deployment";

type RedisClient = Redis;

export type CacheDiagnosticStatus = "HIT" | "MISS" | "DEDUPED" | "BYPASS";

export type CacheDiagnostic = {
  status: CacheDiagnosticStatus;
};

type LocalRateLimit = {
  count: number;
  expiresAt: number;
};

declare global {
  var __korumRedisClient: RedisClient | undefined;
  var __korumRedisConnectPromise: Promise<void> | undefined;
  var __korumRedisDisabledUntil: number | undefined;
  var __korumRedisInflight: Map<string, Promise<unknown>> | undefined;
  var __korumLocalRateLimits: Map<string, LocalRateLimit> | undefined;
}

const CACHE_NAMESPACE = process.env.KORUM_CACHE_NAMESPACE || "korum:v1";
const REDIS_OPERATION_TIMEOUT_MS = 1_500;

function redisClient() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;

  if (!globalThis.__korumRedisClient) {
    const client = new Redis(redisUrl, {
      family: 0,
      lazyConnect: true,
      connectTimeout: REDIS_OPERATION_TIMEOUT_MS,
      commandTimeout: REDIS_OPERATION_TIMEOUT_MS,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (attempt) => Math.min(attempt * 250, 2_000),
    });

    // Cache failures are handled by the caller and must never crash a request.
    client.on("error", () => undefined);
    globalThis.__korumRedisClient = client;
  }

  return globalThis.__korumRedisClient;
}

export async function connectedRedis() {
  const client = redisClient();
  if (!client) return null;

  if (client.status === "wait") {
    globalThis.__korumRedisConnectPromise ??= client.connect()
      .then(() => undefined)
      .finally(() => {
        globalThis.__korumRedisConnectPromise = undefined;
      });
  }

  if (globalThis.__korumRedisConnectPromise) {
    await globalThis.__korumRedisConnectPromise;
  }

  return client;
}

async function runRedis<T>(operation: (client: RedisClient) => Promise<T>) {
  if ((globalThis.__korumRedisDisabledUntil ?? 0) > Date.now()) {
    return { ok: false as const };
  }

  try {
    const client = await connectedRedis();
    if (!client) return { ok: false as const };
    const value = await operation(client);
    globalThis.__korumRedisDisabledUntil = 0;
    return { ok: true as const, value };
  } catch {
    globalThis.__korumRedisDisabledUntil = Date.now() + 5_000;
    return { ok: false as const };
  }
}

export function redisCacheKey(...parts: Array<string | number>) {
  const suffix = parts
    .map((part) => encodeURIComponent(String(part).trim().toLowerCase()))
    .join(":");
  return `${CACHE_NAMESPACE}:${DEPLOYMENT_CACHE_SCOPE}:${suffix}`;
}

export async function invalidateIndexedDebateCaches() {
  // The shared revision isolates in-flight cache fills from later metadata edits.
  await runRedis(client => client.set(redisCacheKey("live", "revision"), randomUUID()));
}

async function readJson<T>(key: string) {
  const result = await runRedis((client) => client.get(key));
  if (!result.ok) return { hit: false as const, bypassed: true as const };
  if (result.value === null) return { hit: false as const, bypassed: false as const };

  try {
    return { hit: true as const, value: JSON.parse(result.value) as T };
  } catch {
    void runRedis((client) => client.del(key));
    return { hit: false as const, bypassed: false as const };
  }
}

async function writeJson(key: string, value: unknown, ttlSeconds: number) {
  await runRedis((client) => client.set(key, JSON.stringify(value), "EX", ttlSeconds));
}

export async function rememberJson<T>(
  key: string,
  ttlSeconds: number,
  load: () => Promise<T>,
  diagnostic?: CacheDiagnostic,
) {
  // Version market caches instead of deleting keys: in-flight old loads stay
  // isolated even when a webhook arrives while PostgreSQL is being queried.
  if (key.startsWith(redisCacheKey("market") + ":") || key.startsWith(redisCacheKey("debates") + ":")) {
    const revision = await runRedis(client => client.get(redisCacheKey("live", "revision")));
    if (revision.ok) key = `${key}:revision:${revision.value ?? "0"}`;
    else {
      if (diagnostic) diagnostic.status = "BYPASS";
      return load();
    }
  }
  const cached = await readJson<T>(key);
  if (cached.hit) {
    if (diagnostic) diagnostic.status = "HIT";
    return cached.value;
  }

  globalThis.__korumRedisInflight ??= new Map<string, Promise<unknown>>();
  const current = globalThis.__korumRedisInflight.get(key) as Promise<T> | undefined;
  if (current) {
    if (diagnostic) diagnostic.status = "DEDUPED";
    return current;
  }

  if (diagnostic) diagnostic.status = cached.bypassed ? "BYPASS" : "MISS";

  const pending = load().then(async (value) => {
    if (value !== null && value !== undefined) {
      await writeJson(key, value, ttlSeconds);
    }
    return value;
  }).finally(() => {
    globalThis.__korumRedisInflight?.delete(key);
  });

  globalThis.__korumRedisInflight.set(key, pending);
  return pending;
}

function localRateLimit(key: string, units: number, limit: number, windowSeconds: number) {
  globalThis.__korumLocalRateLimits ??= new Map<string, LocalRateLimit>();
  const now = Date.now();
  const existing = globalThis.__korumLocalRateLimits.get(key);
  const entry = !existing || existing.expiresAt <= now
    ? { count: 0, expiresAt: now + windowSeconds * 1_000 }
    : existing;

  entry.count += units;
  globalThis.__korumLocalRateLimits.set(key, entry);

  if (globalThis.__korumLocalRateLimits.size > 2_000) {
    for (const [candidate, value] of globalThis.__korumLocalRateLimits) {
      if (value.expiresAt <= now) globalThis.__korumLocalRateLimits.delete(candidate);
    }
  }

  return {
    allowed: entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    retryAfterSeconds: Math.max(1, Math.ceil((entry.expiresAt - now) / 1_000)),
  };
}

const RATE_LIMIT_SCRIPT = `
  local count = redis.call('INCRBY', KEYS[1], ARGV[1])
  if count == tonumber(ARGV[1]) then
    redis.call('EXPIRE', KEYS[1], ARGV[2])
  end
  return { count, redis.call('TTL', KEYS[1]) }
`;

export async function consumeRateLimit(
  key: string,
  units: number,
  limit: number,
  windowSeconds: number,
) {
  const normalizedUnits = Math.max(1, Math.trunc(units));
  const result = await runRedis((client) => client.eval(
    RATE_LIMIT_SCRIPT,
    1,
    key,
    normalizedUnits,
    windowSeconds,
  ));

  if (!result.ok || !Array.isArray(result.value)) {
    return localRateLimit(key, normalizedUnits, limit, windowSeconds);
  }

  const count = Number(result.value[0]);
  const retryAfterSeconds = Math.max(1, Number(result.value[1]));
  return {
    allowed: Number.isFinite(count) && count <= limit,
    remaining: Number.isFinite(count) ? Math.max(0, limit - count) : 0,
    retryAfterSeconds,
  };
}
