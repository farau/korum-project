import type { ChartTrade } from "./chart";
export const MAX_LIVE_BATCH = 100;
export const MAX_WEBHOOK_BYTES = 128 * 1024;
export type TradeNotice = {
  event_id: string;
  chain_id: number;
  token_address: string;
  transaction_hash: string;
  block_hash: string;
  operation: "i" | "u" | "d";
};
export type MarketNotice = { revision: string; tokens: string[]; reset: boolean; trades?: ChartTrade[]; profileWallets?: string[]; profileWallet?: string; profileChanged?: boolean };

export function parseTradeNotices(value: unknown, chainId: number): TradeNotice[] {
  const rows = Array.isArray(value) ? value : [value];
  if (!rows.length || rows.length > MAX_LIVE_BATCH) throw new Error("Invalid batch size");
  const result = new Map<string, TradeNotice>();
  for (const row of rows) {
    if (!row || typeof row !== "object"
      || typeof row.event_id !== "string" || !/^[\w:.-]{1,240}$/.test(row.event_id)
      || Number(row.chain_id) !== chainId
      || typeof row.token_address !== "string" || !/^0x[\da-f]{40}$/i.test(row.token_address)
      || typeof row.transaction_hash !== "string" || !/^0x[\da-f]{64}$/i.test(row.transaction_hash)
      || typeof row.block_hash !== "string" || !/^0x[\da-f]{64}$/i.test(row.block_hash)
      || !["i", "u", "d"].includes(row.operation)) throw new Error("Invalid trade notification");
    const notice: TradeNotice = {
      event_id: row.event_id, chain_id: chainId, token_address: row.token_address.toLowerCase(),
      transaction_hash: row.transaction_hash.toLowerCase(), block_hash: row.block_hash.toLowerCase(), operation: row.operation,
    };
    // A correction can contain several operations for the same event.
    result.set(notice.event_id, notice);
  }
  return [...result.values()];
}
