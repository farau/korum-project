import "server-only";

import { INDEXER_SCHEMA } from "../../config/deployment";
import { KORUM_CHAIN_ID } from "../../config/korum-network";
import { mergeSocialLinks, socialLinksFromJson, type VersusSocialLinks } from "../versus-socials";
import { getDatabase } from "./client";

type SocialsRow = {
  socialsJson: string;
  version: number;
  tokenA: string;
  tokenB: string;
};

export async function getVersusSocialsState(versusId: string) {
  const [row] = await getDatabase().unsafe<SocialsRow[]>(`
    SELECT COALESCE(edited.socials_json, versus.socials_json) AS "socialsJson",
      COALESCE(edited.version, 0)::INTEGER AS version,
      versus.token_a_address AS "tokenA", versus.token_b_address AS "tokenB"
    FROM ${INDEXER_SCHEMA}.versuses versus
    LEFT JOIN public.versus_socials_overrides edited
      ON edited.chain_id = versus.chain_id AND edited.versus_id = versus.versus_id
    WHERE versus.chain_id = $1 AND versus.versus_id = $2::numeric
  `, [KORUM_CHAIN_ID, versusId]);
  return row ? { ...row, links: socialLinksFromJson(row.socialsJson) } : null;
}

export async function saveVersusSocials(input: {
  versusId: string;
  expectedVersion: number;
  currentSocialsJson: string;
  links: VersusSocialLinks;
  wallet: string;
  signature: string;
  deadline: number;
}) {
  const socialsJson = mergeSocialLinks(input.currentSocialsJson, input.links);
  if (Buffer.byteLength(socialsJson) > 2048) throw new Error("Social metadata exceeds 2 KiB.");
  const [row] = await getDatabase().unsafe<{ version: number }[]>(`
    INSERT INTO public.versus_socials_overrides (
      chain_id, versus_id, socials_json, version, updated_by_wallet, signature, signed_deadline
    ) VALUES ($1, $2::numeric, $3, $4, $5, $6, to_timestamp($7 / 1000.0))
    ON CONFLICT (chain_id, versus_id) DO UPDATE SET
      socials_json = EXCLUDED.socials_json,
      version = EXCLUDED.version,
      updated_by_wallet = EXCLUDED.updated_by_wallet,
      signature = EXCLUDED.signature,
      signed_deadline = EXCLUDED.signed_deadline,
      updated_at = NOW()
    WHERE public.versus_socials_overrides.version = $8
    RETURNING version::INTEGER AS version
  `, [KORUM_CHAIN_ID, input.versusId, socialsJson, input.expectedVersion + 1,
    input.wallet.toLowerCase(), input.signature, input.deadline, input.expectedVersion]);
  return row ? { socialsJson, version: row.version } : null;
}
