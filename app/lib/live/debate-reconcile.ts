import { randomUUID } from "node:crypto";
import type Redis from "ioredis";

type Key = (...parts: Array<string | number>) => string;
export const DEBATE_RECONCILE_SECONDS = 60;
const reconcileScript = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
if (redis.call('GET', KEYS[3]) or '0') ~= ARGV[2] then
  redis.call('DEL', KEYS[1])
  return 0
end
local previous = redis.call('GET', KEYS[2])
redis.call('SET', KEYS[2], ARGV[3])
if previous == ARGV[3] then return 0 end
redis.call('SET', KEYS[3], ARGV[4])
redis.call('SET', KEYS[4], ARGV[4])
return 1
`;

// Creation/lifecycle/profile changes have no trade webhook. One shared, small
// metadata probe per minute detects them without expiring quiet market data.
export async function reconcileDebateMetadata(redis: Redis, key: Key, probe: () => Promise<string>, recover?: (lease: string, owner: string) => Promise<void>) {
  const lease = key("live", "debate-metadata-probe-v1");
  const owner = randomUUID();
  if (await redis.set(lease, owner, "EX", DEBATE_RECONCILE_SECONDS, "NX") !== "OK") return;
  const metadata = key("live", "snapshot-metadata");
  // Keep the lease until its normal expiry even on SQL failure: visitors cannot
  // turn an unavailable metadata probe into an unbounded SQL retry.
  const before = await redis.get(metadata) ?? "0";
  const fingerprint = await probe();
  await redis.eval(reconcileScript, 4, lease, key("live", "debate-metadata-fingerprint-v1"),
    metadata, key("live", "revision"), owner, before, fingerprint, randomUUID());
  await recover?.(lease, owner);
}
