CREATE TABLE indexer_v2.creator_fee_recipient_events (
  event_id TEXT NOT NULL,
  chain_id BIGINT NOT NULL,
  token_address VARCHAR(42) COLLATE "C" NOT NULL,
  event_type TEXT NOT NULL,
  previous_recipient VARCHAR(42) COLLATE "C",
  new_recipient VARCHAR(42) COLLATE "C" NOT NULL,
  effective_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  occurred_at TIMESTAMPTZ NOT NULL,
  transaction_hash VARCHAR(66) COLLATE "C" NOT NULL,
  block_hash VARCHAR(66) COLLATE "C" NOT NULL,
  block_number BIGINT NOT NULL,
  log_index INTEGER NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, transaction_hash, log_index),
  CONSTRAINT creator_fee_event_id_unique UNIQUE (event_id),
  CONSTRAINT creator_fee_event_type_valid CHECK (event_type IN ('proposed', 'cancelled', 'updated')),
  CONSTRAINT creator_fee_event_token_format CHECK (token_address ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT creator_fee_event_previous_format CHECK (previous_recipient IS NULL OR previous_recipient ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT creator_fee_event_new_format CHECK (new_recipient ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT creator_fee_event_transaction_format CHECK (transaction_hash ~ '^0x[0-9a-f]{64}$'),
  CONSTRAINT creator_fee_event_block_format CHECK (block_hash ~ '^0x[0-9a-f]{64}$')
);

CREATE INDEX creator_fee_events_token_timeline_idx
  ON indexer_v2.creator_fee_recipient_events
  (chain_id, token_address, block_number DESC, log_index DESC);

CREATE VIEW indexer_v2.camp_fee_recipients AS
SELECT camp.chain_id, camp.versus_id, camp.side, camp.token_address,
  versus.creator_wallet AS original_creator_wallet,
  versus.creator_fee_recipient AS initial_recipient,
  COALESCE(latest.new_recipient, versus.creator_fee_recipient) AS current_recipient,
  latest.occurred_at AS last_changed_at,
  latest.transaction_hash AS last_change_transaction_hash
FROM indexer_v2.versus_camps camp
JOIN indexer_v2.versuses versus
  ON versus.chain_id = camp.chain_id AND versus.versus_id = camp.versus_id
LEFT JOIN LATERAL (
  SELECT event.new_recipient, event.occurred_at, event.transaction_hash
  FROM indexer_v2.creator_fee_recipient_events event
  WHERE event.chain_id = camp.chain_id
    AND event.token_address = camp.token_address
    AND event.event_type = 'updated'
  ORDER BY event.block_number DESC, event.log_index DESC
  LIMIT 1
) latest ON TRUE;
