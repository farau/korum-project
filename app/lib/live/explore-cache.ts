import type Redis from "ioredis";
import type { RankRow } from "../db/explore";
import { parseMaintained } from "../cache/maintained";
import { snapshotKeys } from "./debate-cache";
type Key = (...parts: Array<string | number>) => string;
export function exploreRankingKeys(key: Key) { return snapshotKeys(key, key("live", "explore-ranking-v1")); }

export async function prepareExploreMutation(redis: Redis, key: Key, tokens: string[], revision: string, load: (tokens: string[]) => Promise<RankRow[]>) {
  const keys = exploreRankingKeys(key);
  const [raw, currentRevision, metadata] = await redis.mget(keys.value, keys.revision, keys.metadata);
  const entry = parseMaintained<RankRow[]>(raw, currentRevision ?? "0", metadata ?? "0");
  if (!entry) return { revisions: [], mutations: [] };
  const changed = new Set(tokens);
  const updated = await load(tokens);
  const ids = new Set(updated.map(row => row.id));
  const value = [...entry.value.filter(row => !ids.has(row.id) && !row.tokens.some(token => changed.has(token))), ...updated];
  return { revisions: [keys.revision], mutations: [{ key: keys.value, expected: raw!,
    value: JSON.stringify({ revision, metadata: metadata ?? "0", value }) }] };
}
