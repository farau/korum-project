-- Run transactionally before deploying the bucket-based snapshot reader.
-- Block sink writes during backfill; ordinary reads remain available.
LOCK TABLE indexer_v2.camp_trades IN SHARE ROW EXCLUSIVE MODE;

-- One membership per wallet/token, including fully closed positions. Positions
-- alone cannot answer 'has ever traded'. No dependency on camp ingestion order.
CREATE TABLE indexer_v2.camp_trader_memberships (
  chain_id BIGINT NOT NULL,
  token_address VARCHAR(42) COLLATE "C" NOT NULL,
  trader_address VARCHAR(42) COLLATE "C" NOT NULL,
  trade_count BIGINT NOT NULL CHECK (trade_count > 0),
  PRIMARY KEY (chain_id, token_address, trader_address)
);

-- Blockchain timestamps have second precision. Group at the exact timestamp,
-- without rounding: even fractional timestamps retain exact window boundaries.
CREATE TABLE indexer_v2.camp_trade_buckets (
  chain_id BIGINT NOT NULL,
  token_address VARCHAR(42) COLLATE "C" NOT NULL,
  traded_at TIMESTAMPTZ NOT NULL,
  volume_wei NUMERIC NOT NULL CHECK (volume_wei >= 0),
  trade_count BIGINT NOT NULL CHECK (trade_count > 0),
  close_sqrt_price NUMERIC(78, 0) NOT NULL,
  close_block BIGINT NOT NULL,
  close_log INTEGER NOT NULL,
  PRIMARY KEY (chain_id, token_address, traded_at)
);

-- Repairs the close of a corrected bucket without sorting/scanning a token's
-- entire history; also supports ordered time-range lookups.
CREATE INDEX camp_trades_snapshot_time_idx ON indexer_v2.camp_trades
  (chain_id, token_address, traded_at DESC, block_number DESC, log_index DESC)
  INCLUDE (sqrt_price_x96_after);
-- The new index also serves every lookup supported by the old prefix index.
DROP INDEX indexer_v2.camp_trades_token_time_idx;

INSERT INTO indexer_v2.camp_trader_memberships
SELECT chain_id, token_address, trader_address, COUNT(*)
FROM indexer_v2.camp_trades
WHERE trader_address <> '0x0000000000000000000000000000000000000000'
GROUP BY chain_id, token_address, trader_address;

INSERT INTO indexer_v2.camp_trade_buckets
SELECT totals.chain_id, totals.token_address, totals.traded_at,
  totals.volume_wei, totals.trade_count,
  last_trade.sqrt_price_x96_after, last_trade.block_number, last_trade.log_index
FROM (
  SELECT chain_id, token_address, traded_at, SUM(eth_gross) AS volume_wei, COUNT(*) AS trade_count
  FROM indexer_v2.camp_trades GROUP BY chain_id, token_address, traded_at
) totals
CROSS JOIN LATERAL (
  SELECT sqrt_price_x96_after, block_number, log_index FROM indexer_v2.camp_trades trade
  WHERE trade.chain_id = totals.chain_id AND trade.token_address = totals.token_address
    AND trade.traded_at = totals.traded_at
  ORDER BY block_number DESC, log_index DESC LIMIT 1
) last_trade;

CREATE FUNCTION indexer_v2.sync_market_snapshot_aggregates()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  remaining BIGINT;
  bucket_close_block BIGINT;
  bucket_close_log INTEGER;
BEGIN
  -- Replayed upserts and provenance-only changes do not change aggregates.
  IF TG_OP = 'UPDATE' AND
    (OLD.chain_id, OLD.token_address, OLD.trader_address, OLD.traded_at, OLD.eth_gross,
      OLD.sqrt_price_x96_after, OLD.block_number, OLD.log_index) IS NOT DISTINCT FROM
    (NEW.chain_id, NEW.token_address, NEW.trader_address, NEW.traded_at, NEW.eth_gross,
      NEW.sqrt_price_x96_after, NEW.block_number, NEW.log_index) THEN
    RETURN NEW;
  END IF;

  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    IF OLD.trader_address <> '0x0000000000000000000000000000000000000000' THEN
      -- Lock before deciding between decrement and removal. Concurrent inserts
      -- use the same row lock via ON CONFLICT, including the last-member case.
      SELECT trade_count INTO STRICT remaining FROM indexer_v2.camp_trader_memberships
      WHERE chain_id = OLD.chain_id AND token_address = OLD.token_address
        AND trader_address = OLD.trader_address FOR UPDATE;
      IF remaining = 1 THEN
        DELETE FROM indexer_v2.camp_trader_memberships
        WHERE chain_id = OLD.chain_id AND token_address = OLD.token_address AND trader_address = OLD.trader_address;
      ELSE
        UPDATE indexer_v2.camp_trader_memberships SET trade_count = trade_count - 1
        WHERE chain_id = OLD.chain_id AND token_address = OLD.token_address AND trader_address = OLD.trader_address;
      END IF;
    END IF;

    SELECT trade_count, close_block, close_log INTO STRICT remaining, bucket_close_block, bucket_close_log
    FROM indexer_v2.camp_trade_buckets
    WHERE chain_id = OLD.chain_id AND token_address = OLD.token_address AND traded_at = OLD.traded_at FOR UPDATE;
    IF remaining = 1 THEN
      DELETE FROM indexer_v2.camp_trade_buckets
      WHERE chain_id = OLD.chain_id AND token_address = OLD.token_address AND traded_at = OLD.traded_at;
    ELSE
      UPDATE indexer_v2.camp_trade_buckets SET volume_wei = volume_wei - OLD.eth_gross, trade_count = trade_count - 1
      WHERE chain_id = OLD.chain_id AND token_address = OLD.token_address AND traded_at = OLD.traded_at;
      IF (bucket_close_block, bucket_close_log) = (OLD.block_number, OLD.log_index) THEN
        UPDATE indexer_v2.camp_trade_buckets bucket SET
          close_sqrt_price = latest.sqrt_price_x96_after, close_block = latest.block_number, close_log = latest.log_index
        FROM (
          SELECT sqrt_price_x96_after, block_number, log_index FROM indexer_v2.camp_trades
          WHERE chain_id = OLD.chain_id AND token_address = OLD.token_address AND traded_at = OLD.traded_at
          ORDER BY block_number DESC, log_index DESC LIMIT 1
        ) latest
        WHERE bucket.chain_id = OLD.chain_id AND bucket.token_address = OLD.token_address AND bucket.traded_at = OLD.traded_at;
      END IF;
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    IF NEW.trader_address <> '0x0000000000000000000000000000000000000000' THEN
      INSERT INTO indexer_v2.camp_trader_memberships VALUES
        (NEW.chain_id, NEW.token_address, NEW.trader_address, 1)
      ON CONFLICT (chain_id, token_address, trader_address) DO UPDATE SET
        trade_count = indexer_v2.camp_trader_memberships.trade_count + 1;
    END IF;
    INSERT INTO indexer_v2.camp_trade_buckets VALUES
      (NEW.chain_id, NEW.token_address, NEW.traded_at, NEW.eth_gross, 1,
       NEW.sqrt_price_x96_after, NEW.block_number, NEW.log_index)
    ON CONFLICT (chain_id, token_address, traded_at) DO UPDATE SET
      volume_wei = indexer_v2.camp_trade_buckets.volume_wei + EXCLUDED.volume_wei,
      trade_count = indexer_v2.camp_trade_buckets.trade_count + 1,
      close_sqrt_price = CASE WHEN (EXCLUDED.close_block, EXCLUDED.close_log) >=
        (indexer_v2.camp_trade_buckets.close_block, indexer_v2.camp_trade_buckets.close_log)
        THEN EXCLUDED.close_sqrt_price ELSE indexer_v2.camp_trade_buckets.close_sqrt_price END,
      close_block = GREATEST(EXCLUDED.close_block, indexer_v2.camp_trade_buckets.close_block),
      close_log = CASE WHEN (EXCLUDED.close_block, EXCLUDED.close_log) >=
        (indexer_v2.camp_trade_buckets.close_block, indexer_v2.camp_trade_buckets.close_log)
        THEN EXCLUDED.close_log ELSE indexer_v2.camp_trade_buckets.close_log END;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER camp_trades_snapshot_aggregate_trigger
AFTER INSERT OR UPDATE OR DELETE ON indexer_v2.camp_trades
FOR EACH ROW EXECUTE FUNCTION indexer_v2.sync_market_snapshot_aggregates();
