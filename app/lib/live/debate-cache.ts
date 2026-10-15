import type Redis from "ioredis";
import type { IndexedDebateRow } from "../db/debates";
import { parseMaintained, type MaintainedKeys, type CacheMapping, type MaintainedEntry } from "../cache/maintained";
import type { ChartCacheMutation } from "./chart-cache";

type Key = (...parts: Array<string | number>) => string;
export function debateCatalogKey(key: Key) { return key("live", "debate-catalog-v2"); }
export function debateRowKey(key: Key, id: string) { return key("live", "debate-row-v2", id); }
export function snapshotKeys(key: Key, value: string): MaintainedKeys {
  return { value, revision: `${value}:revision`, metadata: key("live", "snapshot-metadata"), guard: key("live", "revision") };
}
export function debateMappings(key: Key, rows: IndexedDebateRow[]): CacheMapping[] {
  return rows.flatMap(row => [row.tokenAAddress, row.tokenBAddress].map(token => ({
    key: key("live", "token-versus-v1", token), value: String(row.versusId),
  })));
}

// Rebuild only warm, affected records once per batch, before publishing the notice.
// These CAS replacements join the charts in the existing atomic Redis publication.
export async function prepareDebateMutations(
  redis: Redis, key: Key, tokens: string[], revision: string,
  load: (ids: string[]) => Promise<IndexedDebateRow[]>,
): Promise<{ mutations: ChartCacheMutation[]; revisions: string[]; mappings: CacheMapping[] }> {
  const catalog = snapshotKeys(key, debateCatalogKey(key));
  const [metadata, catalogRevision, catalogRaw, ...ids] = await redis.mget(
    catalog.metadata, catalog.revision, catalog.value, ...tokens.map(token => key("live", "token-versus-v1", token)));
  const metadataRevision = metadata ?? "0";
  const entry = parseMaintained<IndexedDebateRow[]>(catalogRaw, catalogRevision ?? "0", metadataRevision);
  const resolvedIds = ids.map((id, index) => id ?? entry?.value.find(row =>
    row.tokenAAddress === tokens[index] || row.tokenBAddress === tokens[index])?.versusId ?? null);
  const knownIds = [...new Set(resolvedIds.filter((id): id is string => Boolean(id)))];
  const details = knownIds.map(id => snapshotKeys(key, debateRowKey(key, id)));
  const detailValues = details.length ? await redis.mget(...details.flatMap(item => [item.revision, item.value])) : [];
  const warm = details.map((item, index) => ({
    id: knownIds[index], keys: item, raw: detailValues[index * 2 + 1],
    entry: parseMaintained<IndexedDebateRow[]>(detailValues[index * 2 + 1], detailValues[index * 2] ?? "0", metadataRevision),
  }));
  const unknownToken = resolvedIds.some(id => !id);
  const affected = new Set(knownIds.filter(id => entry?.value.some(row => String(row.versusId) === id)));
  warm.filter(item => item.entry).forEach(item => affected.add(item.id));
  const rows = affected.size ? await load([...affected]) : [];
  const byId = new Map(rows.map(row => [String(row.versusId), row]));
  const creators = new Map(rows.map(row => [row.creatorWallet, row]));
  const revisions = warm.map(item => item.keys.revision);
  const mutations: ChartCacheMutation[] = [];
  const serialized = (value: IndexedDebateRow[]) => JSON.stringify({ revision, metadata: metadataRevision, value } satisfies MaintainedEntry<IndexedDebateRow[]>);
  // Unknown tokens may belong to a new VS; discover the new catalog on its next read.
  if (!entry || unknownToken || [...affected].some(id => entry.value.some(row => String(row.versusId) === id))) {
    revisions.push(catalog.revision);
    mutations.push({ key: catalog.value, expected: catalogRaw ?? "", value: entry && !unknownToken
      ? serialized(entry.value.flatMap(row => {
        if (affected.has(String(row.versusId))) {
          const updated = byId.get(String(row.versusId));
          return updated ? [updated] : [];
        }
        const creator = creators.get(row.creatorWallet);
        return [creator ? { ...row, creatorVolumeWei: creator.creatorVolumeWei,
          creatorVersusCreated: creator.creatorVersusCreated } : row];
      })) : "" });
  }
  for (const item of warm) {
    if (item.entry) mutations.push({ key: item.keys.value, expected: item.raw ?? "", value: serialized(byId.has(item.id) ? [byId.get(item.id)!] : []) });
  }
  return { mutations, revisions, mappings: debateMappings(key, rows) };
}
