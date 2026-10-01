-- Creator social links are mutable off-chain data. Keep the immutable
-- VersusCreated projection in indexer_v2.versuses owned by Goldsky.
CREATE TABLE public.versus_socials_overrides (
  chain_id BIGINT NOT NULL,
  versus_id NUMERIC(78, 0) NOT NULL,
  socials_json TEXT NOT NULL,
  version BIGINT NOT NULL,
  updated_by_wallet VARCHAR(42) COLLATE "C" NOT NULL,
  signature TEXT NOT NULL,
  signed_deadline TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, versus_id),
  CONSTRAINT versus_socials_version_positive CHECK (version > 0),
  CONSTRAINT versus_socials_json_bounded CHECK (OCTET_LENGTH(socials_json) <= 2048),
  CONSTRAINT versus_socials_wallet_format CHECK (updated_by_wallet ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT versus_socials_signature_format CHECK (signature ~ '^0x[0-9a-fA-F]+$' AND LENGTH(signature) <= 2048)
);
