CREATE TABLE indexer.trader_totals (
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

CREATE TABLE indexer.trader_positions (
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
  ON indexer.trader_positions (chain_id, token_address);

CREATE FUNCTION indexer.apply_trade_aggregate(
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
  INSERT INTO indexer.trader_totals (
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
  )
  ON CONFLICT (chain_id, trader_address) DO UPDATE SET
    total_volume_wei = indexer.trader_totals.total_volume_wei + EXCLUDED.total_volume_wei,
    trade_count = indexer.trader_totals.trade_count + EXCLUDED.trade_count,
    updated_at = NOW();

  INSERT INTO indexer.trader_positions (
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
  )
  ON CONFLICT (chain_id, trader_address, token_address) DO UPDATE SET
    net_token_amount = indexer.trader_positions.net_token_amount + EXCLUDED.net_token_amount,
    net_cash_flow_wei = indexer.trader_positions.net_cash_flow_wei + EXCLUDED.net_cash_flow_wei,
    updated_at = NOW();

  DELETE FROM indexer.trader_totals
  WHERE chain_id = aggregate_chain_id
    AND trader_address = aggregate_trader_address
    AND trade_count = 0
    AND total_volume_wei = 0;

  DELETE FROM indexer.trader_positions
  WHERE chain_id = aggregate_chain_id
    AND trader_address = aggregate_trader_address
    AND token_address = aggregate_token_address
    AND net_token_amount = 0
    AND net_cash_flow_wei = 0;
END;
$$;

CREATE FUNCTION indexer.sync_trade_aggregates()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
    PERFORM indexer.apply_trade_aggregate(
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
    PERFORM indexer.apply_trade_aggregate(
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
AFTER INSERT OR UPDATE OR DELETE ON indexer.camp_trades
FOR EACH ROW EXECUTE FUNCTION indexer.sync_trade_aggregates();

INSERT INTO indexer.trader_totals (
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
FROM indexer.camp_trades
GROUP BY chain_id, trader_address;

INSERT INTO indexer.trader_positions (
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
FROM indexer.camp_trades
GROUP BY chain_id, trader_address, token_address;
