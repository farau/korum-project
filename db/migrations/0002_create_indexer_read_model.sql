ALTER TABLE users
  ALTER COLUMN referral_code DROP EXPRESSION,
  ALTER COLUMN referral_code SET NOT NULL;

DROP INDEX users_referred_by_user_id_idx;

ALTER TABLE users
  DROP CONSTRAINT users_not_self_referred,
  DROP COLUMN referred_by_user_id;

DROP FUNCTION referral_code_from_wallet(TEXT);

CREATE SCHEMA indexer;

CREATE TABLE indexer.referral_bindings (
  chain_id BIGINT NOT NULL,
  registry_address VARCHAR(42) COLLATE "C" NOT NULL,
  user_wallet VARCHAR(42) COLLATE "C" NOT NULL,
  referrer_wallet VARCHAR(42) COLLATE "C" NOT NULL,
  bound_at TIMESTAMPTZ NOT NULL,
  transaction_hash VARCHAR(66) COLLATE "C" NOT NULL,
  block_hash VARCHAR(66) COLLATE "C" NOT NULL,
  block_number BIGINT NOT NULL,
  log_index INTEGER NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, user_wallet),
  CONSTRAINT referral_bindings_event_unique UNIQUE (chain_id, transaction_hash, log_index),
  CONSTRAINT referral_bindings_chain_id_positive CHECK (chain_id > 0),
  CONSTRAINT referral_bindings_registry_address_format CHECK (registry_address ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT referral_bindings_user_wallet_format CHECK (user_wallet ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT referral_bindings_referrer_wallet_format CHECK (referrer_wallet ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT referral_bindings_not_self_referred CHECK (user_wallet <> referrer_wallet),
  CONSTRAINT referral_bindings_transaction_hash_format CHECK (transaction_hash ~ '^0x[0-9a-f]{64}$'),
  CONSTRAINT referral_bindings_block_hash_format CHECK (block_hash ~ '^0x[0-9a-f]{64}$'),
  CONSTRAINT referral_bindings_block_number_nonnegative CHECK (block_number >= 0),
  CONSTRAINT referral_bindings_log_index_nonnegative CHECK (log_index >= 0)
);

CREATE INDEX referral_bindings_referrer_wallet_idx
  ON indexer.referral_bindings (chain_id, referrer_wallet);

CREATE TABLE indexer.versuses (
  chain_id BIGINT NOT NULL,
  versus_id NUMERIC(78, 0) NOT NULL,
  factory_address VARCHAR(42) COLLATE "C" NOT NULL,
  creator_wallet VARCHAR(42) COLLATE "C" NOT NULL,
  config_id BIGINT NOT NULL,
  creator_fee_recipient VARCHAR(42) COLLATE "C" NOT NULL,
  token_a_address VARCHAR(42) COLLATE "C" NOT NULL,
  token_b_address VARCHAR(42) COLLATE "C" NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  socials_json TEXT NOT NULL,
  transaction_hash VARCHAR(66) COLLATE "C" NOT NULL,
  block_hash VARCHAR(66) COLLATE "C" NOT NULL,
  block_number BIGINT NOT NULL,
  log_index INTEGER NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, versus_id),
  CONSTRAINT versuses_event_unique UNIQUE (chain_id, transaction_hash, log_index),
  CONSTRAINT versuses_chain_id_positive CHECK (chain_id > 0),
  CONSTRAINT versuses_versus_id_nonnegative CHECK (versus_id >= 0),
  CONSTRAINT versuses_factory_address_format CHECK (factory_address ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT versuses_creator_wallet_format CHECK (creator_wallet ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT versuses_config_id_uint32 CHECK (config_id BETWEEN 0 AND 4294967295),
  CONSTRAINT versuses_creator_fee_recipient_format CHECK (creator_fee_recipient ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT versuses_token_a_address_format CHECK (token_a_address ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT versuses_token_b_address_format CHECK (token_b_address ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT versuses_distinct_tokens CHECK (token_a_address <> token_b_address),
  CONSTRAINT versuses_transaction_hash_format CHECK (transaction_hash ~ '^0x[0-9a-f]{64}$'),
  CONSTRAINT versuses_block_hash_format CHECK (block_hash ~ '^0x[0-9a-f]{64}$'),
  CONSTRAINT versuses_block_number_nonnegative CHECK (block_number >= 0),
  CONSTRAINT versuses_log_index_nonnegative CHECK (log_index >= 0)
);

CREATE INDEX versuses_creator_wallet_idx
  ON indexer.versuses (chain_id, creator_wallet, created_at DESC);

CREATE INDEX versuses_category_idx
  ON indexer.versuses (chain_id, category, created_at DESC);

CREATE INDEX versuses_created_at_idx
  ON indexer.versuses (chain_id, created_at DESC);

CREATE INDEX versuses_token_a_address_idx
  ON indexer.versuses (chain_id, token_a_address);

CREATE INDEX versuses_token_b_address_idx
  ON indexer.versuses (chain_id, token_b_address);

CREATE TABLE indexer.versus_camps (
  chain_id BIGINT NOT NULL,
  versus_id NUMERIC(78, 0) NOT NULL,
  side SMALLINT NOT NULL,
  token_address VARCHAR(42) COLLATE "C" NOT NULL,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  uri TEXT NOT NULL,
  virtual_eth NUMERIC(39, 0) NOT NULL,
  graduation_eth NUMERIC(39, 0) NOT NULL,
  total_supply NUMERIC(78, 0) NOT NULL,
  block_timestamp TIMESTAMPTZ,
  transaction_hash VARCHAR(66) COLLATE "C" NOT NULL,
  block_hash VARCHAR(66) COLLATE "C" NOT NULL,
  block_number BIGINT NOT NULL,
  log_index INTEGER NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, versus_id, side),
  CONSTRAINT versus_camps_token_unique UNIQUE (chain_id, token_address),
  CONSTRAINT versus_camps_event_unique UNIQUE (chain_id, transaction_hash, log_index),
  CONSTRAINT versus_camps_chain_id_positive CHECK (chain_id > 0),
  CONSTRAINT versus_camps_versus_id_nonnegative CHECK (versus_id >= 0),
  CONSTRAINT versus_camps_side_valid CHECK (side IN (0, 1)),
  CONSTRAINT versus_camps_token_address_format CHECK (token_address ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT versus_camps_virtual_eth_nonnegative CHECK (virtual_eth >= 0),
  CONSTRAINT versus_camps_graduation_eth_nonnegative CHECK (graduation_eth >= 0),
  CONSTRAINT versus_camps_total_supply_nonnegative CHECK (total_supply >= 0),
  CONSTRAINT versus_camps_transaction_hash_format CHECK (transaction_hash ~ '^0x[0-9a-f]{64}$'),
  CONSTRAINT versus_camps_block_hash_format CHECK (block_hash ~ '^0x[0-9a-f]{64}$'),
  CONSTRAINT versus_camps_block_number_nonnegative CHECK (block_number >= 0),
  CONSTRAINT versus_camps_log_index_nonnegative CHECK (log_index >= 0)
);

CREATE INDEX versus_camps_versus_id_idx
  ON indexer.versus_camps (chain_id, versus_id);
