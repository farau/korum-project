import "server-only";

import { INDEXER_SCHEMA } from "../../config/deployment";
import { KORUM_CHAIN_ID } from "../../config/korum-network";
import { getDatabase } from "./client";
import { publicAssetUrl } from "./debates";

export type ManagedCamp = {
  versusId: string;
  title: string;
  side: number;
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  tokenImage?: string;
};

export async function getManagedVersus(wallet: string) {
  const rows = await getDatabase().unsafe<(ManagedCamp & { tokenUri: string })[]>(`
    SELECT recipient.versus_id::TEXT AS "versusId",
      versus.title, recipient.side,
      recipient.token_address AS "tokenAddress",
      camp.name AS "tokenName", camp.symbol AS "tokenSymbol", camp.uri AS "tokenUri"
    FROM ${INDEXER_SCHEMA}.camp_fee_recipients recipient
    JOIN ${INDEXER_SCHEMA}.versuses versus
      ON versus.chain_id = recipient.chain_id AND versus.versus_id = recipient.versus_id
    JOIN ${INDEXER_SCHEMA}.versus_camps camp
      ON camp.chain_id = recipient.chain_id AND camp.token_address = recipient.token_address
    WHERE recipient.chain_id = $1 AND recipient.current_recipient = $2
    ORDER BY versus.created_at DESC, recipient.versus_id DESC, recipient.side ASC
    LIMIT 101
  `, [KORUM_CHAIN_ID, wallet.toLowerCase()]);

  return {
    items: rows.slice(0, 100).map(({ tokenUri, ...camp }) => ({ ...camp, tokenImage: publicAssetUrl(tokenUri) })),
    limited: rows.length > 100,
  };
}
