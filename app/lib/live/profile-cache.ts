import { createHash } from "node:crypto";
import type Redis from "ioredis";
import type { MaintainedKeys, CacheMapping } from "../cache/maintained";
import type { TradeNotice } from "./protocol";

type Key = (...parts: Array<string | number>) => string;
export function profileWalletHash(wallet: string) {
  return createHash("sha256").update(wallet.toLowerCase()).digest("hex");
}
export function profileSourceKeys(key: Key, walletHash: string): MaintainedKeys {
  const value = key("private", "profile-source-v1", walletHash);
  const revision = `${value}:revision`;
  // An unrelated trade must not restart a private cold fill. Its own revision
  // and the metadata guard fence all events that affect this wallet's source.
  return { value, revision, metadata: key("live", "snapshot-metadata"), guard: revision };
}
export function activeProfileKey(key: Key) { return key("live", "profile-source-active-v1"); }

// Personal trade counters change for the trader, creator and bound referrer.
// Prices for all other holders are read from shared market snapshots instead.
export async function prepareProfileInvalidations(
  redis: Redis, key: Key, notices: TradeNotice[],
  load: (notices: TradeNotice[]) => Promise<Array<{ eventId: string; wallets: string[] }>>,
): Promise<{ revisions: string[]; mappings: CacheMapping[] }> {
  if (!await redis.get(activeProfileKey(key))) return { revisions: [], mappings: [] };
  const eventKeys = notices.map(notice => key("live", "profile-event-wallets-v1",
    createHash("sha256").update(notice.event_id).digest("hex")));
  const previous = await redis.mget(...eventKeys);
  const current = notices.filter(notice => notice.operation !== "d");
  const rows = current.length ? await load(current) : [];
  const targets = new Map(rows.map(row => [row.eventId, row.wallets.filter(wallet => /^0x[0-9a-f]{40}$/i.test(wallet)).map(profileWalletHash)]));
  const affected = new Set<string>();
  let unknownDeletion = false;
  const mappings = notices.map((notice, index) => {
    let old: string[] | null = null;
    try {
      const parsed = JSON.parse(previous[index] ?? "null") as unknown;
      if (Array.isArray(parsed) && parsed.every(hash => typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash))) old = parsed;
    } catch { /* Recover unknown corrections conservatively. */ }
    if (notice.operation !== "i" && !old) unknownDeletion = true;
    const hashes = [...new Set([...(old ?? []), ...(targets.get(notice.event_id) ?? [])])];
    hashes.forEach(hash => affected.add(hash));
    return { key: eventKeys[index], value: JSON.stringify(hashes) };
  });
  const revisions = [...affected].map(hash => profileSourceKeys(key, hash).revision);
  // Old deletes/updates can have lost their event-to-wallet mapping. Advance
  // metadata once to recover private sources whose old actor cannot be found.
  if (unknownDeletion) revisions.push(key("live", "snapshot-metadata"));
  return { revisions, mappings };
}
