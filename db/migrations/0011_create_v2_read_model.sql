-- Isolated v2 read model: v1 versus IDs, positions and referrals must never leak into v2.
-- Preserve indexer and public.user_watchlist for the previous deployment.

CREATE SCHEMA indexer_v2;

CREATE TABLE indexer_v2.referral_bindings (
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
  ON indexer_v2.referral_bindings (chain_id, referrer_wallet);

CREATE TABLE indexer_v2.versuses (
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
  ON indexer_v2.versuses (chain_id, creator_wallet, created_at DESC);

CREATE INDEX versuses_category_idx
  ON indexer_v2.versuses (chain_id, category, created_at DESC);

CREATE INDEX versuses_created_at_idx
  ON indexer_v2.versuses (chain_id, created_at DESC);

CREATE INDEX versuses_token_a_address_idx
  ON indexer_v2.versuses (chain_id, token_a_address);

CREATE INDEX versuses_token_b_address_idx
  ON indexer_v2.versuses (chain_id, token_b_address);

CREATE TABLE indexer_v2.versus_camps (
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
  ON indexer_v2.versus_camps (chain_id, versus_id);

CREATE TABLE indexer_v2.camp_trades (
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
  ON indexer_v2.camp_trades (chain_id, token_address, block_number DESC, log_index DESC);

CREATE INDEX camp_trades_token_time_idx
  ON indexer_v2.camp_trades (chain_id, token_address, traded_at DESC);

CREATE TABLE indexer_v2.camp_curve_lifecycle (
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
  ON indexer_v2.camp_curve_lifecycle (chain_id, token_address, block_number DESC, log_index DESC);

CREATE TABLE indexer_v2.camp_graduations (
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

CREATE VIEW indexer_v2.camp_market_state AS
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
FROM indexer_v2.versus_camps camp
LEFT JOIN LATERAL (
  SELECT trade.*
  FROM indexer_v2.camp_trades trade
  WHERE trade.chain_id = camp.chain_id
    AND trade.token_address = camp.token_address
  ORDER BY trade.block_number DESC, trade.log_index DESC
  LIMIT 1
) latest_trade ON TRUE
LEFT JOIN LATERAL (
  SELECT trade.*
  FROM indexer_v2.camp_trades trade
  WHERE trade.chain_id = camp.chain_id
    AND trade.token_address = camp.token_address
    AND trade.venue = 0
  ORDER BY trade.block_number DESC, trade.log_index DESC
  LIMIT 1
) curve_trade ON TRUE
LEFT JOIN LATERAL (
  SELECT event.curve_status, event.graduation_disabled
  FROM indexer_v2.camp_curve_lifecycle event
  WHERE event.chain_id = camp.chain_id
    AND event.token_address = camp.token_address
  ORDER BY event.block_number DESC, event.log_index DESC
  LIMIT 1
) lifecycle ON TRUE
LEFT JOIN indexer_v2.camp_graduations graduation
  ON graduation.chain_id = camp.chain_id
  AND graduation.token_address = camp.token_address;

CREATE INDEX IF NOT EXISTS camp_trades_chain_timeline_idx
  ON indexer_v2.camp_trades (chain_id, block_number DESC, log_index DESC);

CREATE INDEX IF NOT EXISTS camp_trades_profile_stats_idx
  ON indexer_v2.camp_trades (chain_id, trader_address)
  INCLUDE (token_address, eth_gross);

CREATE TABLE indexer_v2.trader_totals (
  chain_id BIGINT NOT NULL,
  trader_address VARCHAR(42) COLLATE "C" NOT NULL,
  total_volume_wei NUMERIC(78, 0) NOT NULL DEFAULT 0,
  trade_count BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, trader_address),
  CONSTRAINT trader_totals_chain_id_positive CHECK (chain_id > 0),
  CONSTRAINT trader_totals_address_format CHECK (trader_address ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT trader_totals_volume_nonnegative CHECK (total_volume_wei >= 0),
  CONSTRAINT trader_totals_count_nonnegative CHECK (trade_count >= 0)
);

CREATE TABLE indexer_v2.trader_positions (
  chain_id BIGINT NOT NULL,
  trader_address VARCHAR(42) COLLATE "C" NOT NULL,
  token_address VARCHAR(42) COLLATE "C" NOT NULL,
  net_token_amount NUMERIC(78, 0) NOT NULL DEFAULT 0,
  net_cash_flow_wei NUMERIC(78, 0) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, trader_address, token_address),
  CONSTRAINT trader_positions_chain_id_positive CHECK (chain_id > 0),
  CONSTRAINT trader_positions_trader_format CHECK (trader_address ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT trader_positions_token_format CHECK (token_address ~ '^0x[0-9a-f]{40}$')
);

CREATE INDEX trader_positions_token_idx
  ON indexer_v2.trader_positions (chain_id, token_address);

CREATE FUNCTION indexer_v2.apply_trade_aggregate(
  aggregate_chain_id BIGINT,
  aggregate_trader_address VARCHAR(42),
  aggregate_token_address VARCHAR(42),
  volume_delta NUMERIC,
  count_delta BIGINT,
  token_delta NUMERIC,
  cash_flow_delta NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE indexer_v2.trader_totals SET
    total_volume_wei = total_volume_wei + volume_delta,
    trade_count = trade_count + count_delta,
    updated_at = NOW()
  WHERE chain_id = aggregate_chain_id
    AND trader_address = aggregate_trader_address;

  IF NOT FOUND THEN
    IF count_delta < 0 OR volume_delta < 0 THEN
      RAISE EXCEPTION 'Cannot subtract a missing trader aggregate for chain % and wallet %',
        aggregate_chain_id, aggregate_trader_address;
    END IF;

    INSERT INTO indexer_v2.trader_totals (
      chain_id,
      trader_address,
      total_volume_wei,
      trade_count,
      updated_at
    ) VALUES (
      aggregate_chain_id,
      aggregate_trader_address,
      volume_delta,
      count_delta,
      NOW()
    );
  END IF;

  UPDATE indexer_v2.trader_positions SET
    net_token_amount = net_token_amount + token_delta,
    net_cash_flow_wei = net_cash_flow_wei + cash_flow_delta,
    updated_at = NOW()
  WHERE chain_id = aggregate_chain_id
    AND trader_address = aggregate_trader_address
    AND token_address = aggregate_token_address;

  IF NOT FOUND THEN
    IF count_delta < 0 THEN
      RAISE EXCEPTION 'Cannot subtract a missing trader position for chain %, wallet %, and token %',
        aggregate_chain_id, aggregate_trader_address, aggregate_token_address;
    END IF;

    INSERT INTO indexer_v2.trader_positions (
      chain_id,
      trader_address,
      token_address,
      net_token_amount,
      net_cash_flow_wei,
      updated_at
    ) VALUES (
      aggregate_chain_id,
      aggregate_trader_address,
      aggregate_token_address,
      token_delta,
      cash_flow_delta,
      NOW()
    );
  END IF;

  DELETE FROM indexer_v2.trader_totals
  WHERE chain_id = aggregate_chain_id
    AND trader_address = aggregate_trader_address
    AND trade_count = 0
    AND total_volume_wei = 0;

  DELETE FROM indexer_v2.trader_positions
  WHERE chain_id = aggregate_chain_id
    AND trader_address = aggregate_trader_address
    AND token_address = aggregate_token_address
    AND net_token_amount = 0
    AND net_cash_flow_wei = 0;
END;
$$;

CREATE FUNCTION indexer_v2.sync_trade_aggregates()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
    PERFORM indexer_v2.apply_trade_aggregate(
      OLD.chain_id,
      OLD.trader_address,
      OLD.token_address,
      -OLD.eth_gross,
      -1,
      CASE WHEN OLD.is_buy THEN -OLD.token_amount ELSE OLD.token_amount END,
      CASE WHEN OLD.is_buy THEN OLD.eth_gross ELSE -(OLD.eth_gross - OLD.fee_total) END
    );
  END IF;

  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    PERFORM indexer_v2.apply_trade_aggregate(
      NEW.chain_id,
      NEW.trader_address,
      NEW.token_address,
      NEW.eth_gross,
      1,
      CASE WHEN NEW.is_buy THEN NEW.token_amount ELSE -NEW.token_amount END,
      CASE WHEN NEW.is_buy THEN -NEW.eth_gross ELSE NEW.eth_gross - NEW.fee_total END
    );
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER camp_trades_aggregate_trigger
AFTER INSERT OR UPDATE OR DELETE ON indexer_v2.camp_trades
FOR EACH ROW EXECUTE FUNCTION indexer_v2.sync_trade_aggregates();

INSERT INTO indexer_v2.trader_totals (
  chain_id,
  trader_address,
  total_volume_wei,
  trade_count
)
SELECT
  chain_id,
  trader_address,
  SUM(eth_gross),
  COUNT(*)
FROM indexer_v2.camp_trades
GROUP BY chain_id, trader_address;

INSERT INTO indexer_v2.trader_positions (
  chain_id,
  trader_address,
  token_address,
  net_token_amount,
  net_cash_flow_wei
)
SELECT
  chain_id,
  trader_address,
  token_address,
  SUM(CASE WHEN is_buy THEN token_amount ELSE -token_amount END),
  SUM(CASE WHEN is_buy THEN -eth_gross ELSE eth_gross - fee_total END)
FROM indexer_v2.camp_trades
GROUP BY chain_id, trader_address, token_address;

ALTER TABLE indexer_v2.versus_camps
  ADD COLUMN economics_id BIGINT NOT NULL CHECK (economics_id > 0),
  ADD COLUMN quote_asset VARCHAR(42) NOT NULL CHECK (quote_asset = '0x0000000000000000000000000000000000000000');

CREATE TABLE user_watchlist_v2 (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chain_id BIGINT NOT NULL,
  versus_id NUMERIC(78, 0) NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, chain_id, versus_id),
  CONSTRAINT user_watchlist_v2_chain_id_positive CHECK (chain_id > 0),
  CONSTRAINT user_watchlist_v2_versus_id_nonnegative CHECK (versus_id >= 0)
);

CREATE INDEX user_watchlist_v2_versus_idx
  ON user_watchlist_v2 (chain_id, versus_id);
