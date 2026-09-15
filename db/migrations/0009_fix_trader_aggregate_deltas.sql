CREATE OR REPLACE FUNCTION indexer.apply_trade_aggregate(
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
  UPDATE indexer.trader_totals SET
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
    );
  END IF;

  UPDATE indexer.trader_positions SET
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
    );
  END IF;

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
