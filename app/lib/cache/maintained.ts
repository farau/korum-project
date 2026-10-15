import { randomUUID } from "node:crypto";
import type Redis from "ioredis";
import type { CacheDiagnostic } from "./redis";

export const MAINTAINED_IDLE_SECONDS = 600;
export type MaintainedEntry<T> = { revision: string; metadata: string; value: T };
export type MaintainedKeys = { value: string; revision: string; metadata: string; guard: string };
export type CacheMapping = { key: string; value: string };
export function parseMaintained<T>(raw: string | null, revision: string, metadata: string): MaintainedEntry<T> | null {
  if (!raw) return null;
  try {
    const entry = JSON.parse(raw) as MaintainedEntry<T>;
    // Both public snapshots and private membership snapshots store arrays.
    return entry.revision === revision && entry.metadata === metadata && Array.isArray(entry.value) ? entry : null;
  } catch { return null; }
}
const readScript = `
local value = redis.call('GET', KEYS[1]) or ''
if value ~= '' then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
  redis.call('EXPIRE', KEYS[2], 86400)
end
return {value, redis.call('GET', KEYS[2]) or '0', redis.call('GET', KEYS[3]) or '0', redis.call('GET', KEYS[4]) or '0'}
`;
const storeScript = `
if (redis.call('GET', KEYS[2]) or '0') ~= ARGV[1] then return 0 end
if (redis.call('GET', KEYS[3]) or '0') ~= ARGV[2] then return 0 end
if (redis.call('GET', KEYS[4]) or '0') ~= ARGV[3] then return 0 end
if redis.call('GET', KEYS[5]) ~= ARGV[4] then return 0 end
redis.call('SET', KEYS[1], ARGV[5], 'EX', ARGV[6])
for _, mapping in ipairs(cjson.decode(ARGV[7])) do redis.call('SET', mapping.key, mapping.value, 'EX', 86400) end
return 1
`;
const releaseScript = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0`;

export async function maintainedHit<T>(redis: Redis, keys: MaintainedKeys) {
  const [raw, revision, metadata, guard] = await redis.eval(readScript, 4,
    keys.value, keys.revision, keys.metadata, keys.guard, MAINTAINED_IDLE_SECONDS) as string[];
  return { entry: parseMaintained<T>(raw, revision, metadata), revision, metadata, guard };
}
const inflight = new Map<string, Promise<unknown>>();

// A miss has one owner across replicas. A busy lease never creates a parallel SQL load.
export async function readMaintained<T>(
  redis: Redis, keys: MaintainedKeys, load: () => Promise<T>, diagnostic?: CacheDiagnostic,
  mappings: (value: T) => CacheMapping[] = () => [],
): Promise<T> {
  const existing = inflight.get(keys.value);
  if (existing) {
    if (diagnostic) diagnostic.status = "DEDUPED";
    return existing as Promise<T>;
  }
  const pending = (async () => {
    let state = await maintainedHit<T>(redis, keys);
    if (state.entry) { if (diagnostic) diagnostic.status = "HIT"; return state.entry.value; }
    const owner = randomUUID();
    const lock = `${keys.value}:loading`;
    const deadline = Date.now() + 10_000;
    while (await redis.set(lock, owner, "EX", 30, "NX") !== "OK") {
      if (Date.now() >= deadline) throw new Error("Shared snapshot is still loading; retry shortly.");
      await new Promise(resolve => setTimeout(resolve, 100));
      state = await maintainedHit<T>(redis, keys);
      if (state.entry) { if (diagnostic) diagnostic.status = "DEDUPED"; return state.entry.value; }
    }
    try {
      state = await maintainedHit<T>(redis, keys);
      if (state.entry) { if (diagnostic) diagnostic.status = "HIT"; return state.entry.value; }
      if (diagnostic) diagnostic.status = "MISS";
      for (let attempt = 0; attempt < 3; attempt++) {
        const value = await load();
        const stored = await redis.eval(storeScript, 5, keys.value, keys.revision, keys.metadata, keys.guard, lock,
          state.revision, state.metadata, state.guard, owner,
          JSON.stringify({ revision: state.revision, metadata: state.metadata, value }), MAINTAINED_IDLE_SECONDS,
          JSON.stringify(mappings(value)));
        if (stored === 1) return value;
        state = await maintainedHit<T>(redis, keys);
        if (state.entry) return state.entry.value;
      }
      throw new Error("Market snapshot changed during reconstruction; retry shortly.");
    } finally { await redis.eval(releaseScript, 1, lock, owner); }
  })().finally(() => inflight.delete(keys.value));
  inflight.set(keys.value, pending);
  return pending;
}
