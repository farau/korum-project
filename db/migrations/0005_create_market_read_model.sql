CREATE TABLE indexer.camp_trades (
  event_id TEXT NOT NULL,
  chain_id BIGINT NOT NULL,
  token_address VARCHAR(42) COLLATE "C" NOT NULL,
  trader_address VARCHAR(42) COLLATE "C" NOT NULL,
  referrer_address VARCHAR(42) COLLATE "C" NOT NULL,
  venue SMALLINT NOT NULL,
  kind SMALLINT NOT NULL,
  is_buy BOOLEAN NOT NULL,
  eth_gross NUMERIC(39, 0) NOT NULL,
  token_amount NUMERIC(78, 0) NOT NULL,
  fee_total NUMERIC(39, 0) NOT NULL,
  fee_creator NUMERIC(39, 0) NOT NULL,
  fee_referrer NUMERIC(39, 0) NOT NULL,
  fee_platform NUMERIC(39, 0) NOT NULL,
  tier_fee_bps INTEGER NOT NULL,
  tier_creator_share_bps INTEGER NOT NULL,
  snipe_tax_bps INTEGER NOT NULL,
  sqrt_price_x96_after NUMERIC(78, 0) NOT NULL,
  real_eth_after NUMERIC(39, 0) NOT NULL,
  token_reserve_after NUMERIC(78, 0) NOT NULL,
  cumulative_volume_after NUMERIC(39, 0) NOT NULL,
  traded_at TIMESTAMPTZ NOT NULL,
  transaction_hash VARCHAR(66) COLLATE "C" NOT NULL,
  block_hash VARCHAR(66) COLLATE "C" NOT NULL,
  block_number BIGINT NOT NULL,
  log_index INTEGER NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, transaction_hash, log_index),
  CONSTRAINT camp_trades_event_id_unique UNIQUE (event_id),
  CONSTRAINT camp_trades_chain_id_positive CHECK (chain_id > 0),
  CONSTRAINT camp_trades_token_address_format CHECK (token_address ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT camp_trades_trader_address_format CHECK (trader_address ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT camp_trades_referrer_address_format CHECK (referrer_address ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT camp_trades_venue_valid CHECK (venue IN (0, 1)),
  CONSTRAINT camp_trades_kind_valid CHECK (kind IN (0, 1)),
  CONSTRAINT camp_trades_amounts_nonnegative CHECK (
    eth_gross >= 0 AND token_amount >= 0 AND fee_total >= 0
    AND fee_creator >= 0 AND fee_referrer >= 0 AND fee_platform >= 0
    AND real_eth_after >= 0 AND token_reserve_after >= 0
    AND cumulative_volume_after >= 0
  ),
  CONSTRAINT camp_trades_fees_reconcile CHECK (
    fee_total = fee_creator + fee_referrer + fee_platform
  ),
  CONSTRAINT camp_trades_bps_valid CHECK (
    tier_fee_bps BETWEEN 0 AND 10000
    AND tier_creator_share_bps BETWEEN 0 AND 10000
    AND snipe_tax_bps BETWEEN 0 AND 10000
  ),
  CONSTRAINT camp_trades_sqrt_price_positive CHECK (sqrt_price_x96_after > 0),
  CONSTRAINT camp_trades_transaction_hash_format CHECK (transaction_hash ~ '^0x[0-9a-f]{64}$'),
  CONSTRAINT camp_trades_block_hash_format CHECK (block_hash ~ '^0x[0-9a-f]{64}$'),
  CONSTRAINT camp_trades_block_number_nonnegative CHECK (block_number >= 0),
  CONSTRAINT camp_trades_log_index_nonnegative CHECK (log_index >= 0)
);

CREATE INDEX camp_trades_token_timeline_idx
  ON indexer.camp_trades (chain_id, token_address, block_number DESC, log_index DESC);

CREATE INDEX camp_trades_token_time_idx
  ON indexer.camp_trades (chain_id, token_address, traded_at DESC);

CREATE TABLE indexer.camp_curve_lifecycle (
  event_id TEXT NOT NULL,
  chain_id BIGINT NOT NULL,
  token_address VARCHAR(42) COLLATE "C" NOT NULL,
  event_type TEXT NOT NULL,
  curve_status SMALLINT NOT NULL,
  graduation_disabled BOOLEAN NOT NULL,
  happened_at TIMESTAMPTZ NOT NULL,
  transaction_hash VARCHAR(66) COLLATE "C" NOT NULL,
  block_hash VARCHAR(66) COLLATE "C" NOT NULL,
  block_number BIGINT NOT NULL,
  log_index INTEGER NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, transaction_hash, log_index),
  CONSTRAINT camp_curve_lifecycle_event_id_unique UNIQUE (event_id),
  CONSTRAINT camp_curve_lifecycle_chain_id_positive CHECK (chain_id > 0),
  CONSTRAINT camp_curve_lifecycle_token_address_format CHECK (token_address ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT camp_curve_lifecycle_event_type_valid CHECK (event_type IN ('graduation_pending', 'graduated', 'curve_reopened')),
  CONSTRAINT camp_curve_lifecycle_status_valid CHECK (curve_status IN (1, 2, 3)),
  CONSTRAINT camp_curve_lifecycle_transaction_hash_format CHECK (transaction_hash ~ '^0x[0-9a-f]{64}$'),
  CONSTRAINT camp_curve_lifecycle_block_hash_format CHECK (block_hash ~ '^0x[0-9a-f]{64}$'),
  CONSTRAINT camp_curve_lifecycle_block_number_nonnegative CHECK (block_number >= 0),
  CONSTRAINT camp_curve_lifecycle_log_index_nonnegative CHECK (log_index >= 0)
);

CREATE INDEX camp_curve_lifecycle_token_timeline_idx
  ON indexer.camp_curve_lifecycle (chain_id, token_address, block_number DESC, log_index DESC);

CREATE TABLE indexer.camp_graduations (
  chain_id BIGINT NOT NULL,
  token_address VARCHAR(42) COLLATE "C" NOT NULL,
  pool_id VARCHAR(66) COLLATE "C" NOT NULL,
  sqrt_price_x96 NUMERIC(78, 0) NOT NULL,
  eth_deposited NUMERIC(39, 0) NOT NULL,
  tokens_deposited NUMERIC(78, 0) NOT NULL,
  position_token_id NUMERIC(78, 0) NOT NULL,
  eth_residual NUMERIC(39, 0) NOT NULL,
  token_residual NUMERIC(78, 0) NOT NULL,
  graduated_at TIMESTAMPTZ NOT NULL,
  transaction_hash VARCHAR(66) COLLATE "C" NOT NULL,
  block_hash VARCHAR(66) COLLATE "C" NOT NULL,
  block_number BIGINT NOT NULL,
  log_index INTEGER NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, token_address),
  CONSTRAINT camp_graduations_event_unique UNIQUE (chain_id, transaction_hash, log_index),
  CONSTRAINT camp_graduations_chain_id_positive CHECK (chain_id > 0),
  CONSTRAINT camp_graduations_token_address_format CHECK (token_address ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT camp_graduations_pool_id_format CHECK (pool_id ~ '^0x[0-9a-f]{64}$'),
  CONSTRAINT camp_graduations_values_nonnegative CHECK (
    sqrt_price_x96 > 0 AND eth_deposited >= 0 AND tokens_deposited >= 0
    AND position_token_id >= 0 AND eth_residual >= 0 AND token_residual >= 0
  ),
  CONSTRAINT camp_graduations_transaction_hash_format CHECK (transaction_hash ~ '^0x[0-9a-f]{64}$'),
  CONSTRAINT camp_graduations_block_hash_format CHECK (block_hash ~ '^0x[0-9a-f]{64}$'),
  CONSTRAINT camp_graduations_block_number_nonnegative CHECK (block_number >= 0),
  CONSTRAINT camp_graduations_log_index_nonnegative CHECK (log_index >= 0)
);

CREATE VIEW indexer.camp_market_state AS
SELECT
  camp.chain_id,
  camp.versus_id,
  camp.side,
  camp.token_address,
  camp.virtual_eth,
  camp.graduation_eth,
  camp.total_supply,
  COALESCE(lifecycle.curve_status, 1)::SMALLINT AS curve_status,
  COALESCE(lifecycle.graduation_disabled, FALSE) AS graduation_disabled,
  latest_trade.sqrt_price_x96_after,
  curve_trade.real_eth_after,
  curve_trade.token_reserve_after,
  latest_trade.cumulative_volume_after,
  graduation.token_residual,
  CASE
    WHEN camp.virtual_eth + camp.graduation_eth = 0 THEN 0
    ELSE FLOOR(
      camp.total_supply * camp.virtual_eth * camp.virtual_eth
      / ((camp.virtual_eth + camp.graduation_eth) * (camp.virtual_eth + camp.graduation_eth))
    )
  END AS projected_token_residual,
  CASE
    WHEN COALESCE(lifecycle.curve_status, 1) = 3 AND graduation.token_residual IS NOT NULL
      THEN camp.total_supply - graduation.token_residual
    ELSE camp.total_supply - COALESCE(curve_trade.token_reserve_after, camp.total_supply)
  END AS circulating_supply,
  CASE
    WHEN COALESCE(lifecycle.curve_status, 1) = 3 AND graduation.token_residual IS NOT NULL
      THEN camp.total_supply - graduation.token_residual
    WHEN COALESCE(lifecycle.graduation_disabled, FALSE)
      THEN camp.total_supply
    WHEN camp.virtual_eth + camp.graduation_eth = 0
      THEN camp.total_supply
    ELSE camp.total_supply - FLOOR(
      camp.total_supply * camp.virtual_eth * camp.virtual_eth
      / ((camp.virtual_eth + camp.graduation_eth) * (camp.virtual_eth + camp.graduation_eth))
    )
  END AS adjusted_fdv_supply,
  latest_trade.traded_at AS last_trade_at,
  latest_trade.block_number AS last_trade_block,
  latest_trade.log_index AS last_trade_log_index,
  'ETH'::TEXT AS quote_symbol
FROM indexer.versus_camps camp
LEFT JOIN LATERAL (
  SELECT trade.*
  FROM indexer.camp_trades trade
  WHERE trade.chain_id = camp.chain_id
    AND trade.token_address = camp.token_address
  ORDER BY trade.block_number DESC, trade.log_index DESC
  LIMIT 1
) latest_trade ON TRUE
LEFT JOIN LATERAL (
  SELECT trade.*
  FROM indexer.camp_trades trade
  WHERE trade.chain_id = camp.chain_id
    AND trade.token_address = camp.token_address
    AND trade.venue = 0
  ORDER BY trade.block_number DESC, trade.log_index DESC
  LIMIT 1
) curve_trade ON TRUE
LEFT JOIN LATERAL (
  SELECT event.curve_status, event.graduation_disabled
  FROM indexer.camp_curve_lifecycle event
  WHERE event.chain_id = camp.chain_id
    AND event.token_address = camp.token_address
  ORDER BY event.block_number DESC, event.log_index DESC
  LIMIT 1
) lifecycle ON TRUE
LEFT JOIN indexer.camp_graduations graduation
  ON graduation.chain_id = camp.chain_id
  AND graduation.token_address = camp.token_address;
