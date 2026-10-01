ALTER TABLE indexer_v2.camp_trades
  ADD COLUMN emitter_address VARCHAR(42) COLLATE "C",
  ADD COLUMN pool_id VARCHAR(66) COLLATE "C";

ALTER TABLE indexer_v2.camp_trades
  ADD CONSTRAINT camp_trades_emitter_address_format CHECK (
    emitter_address IS NULL OR emitter_address ~ '^0x[0-9a-f]{40}$'
  ),
  ADD CONSTRAINT camp_trades_pool_id_format CHECK (
    pool_id IS NULL OR pool_id ~ '^0x[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT camp_trades_curve_has_no_pool CHECK (
    venue <> 0 OR pool_id IS NULL
  );

CREATE OR REPLACE FUNCTION indexer_v2.set_camp_trade_pool_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.venue = 0 THEN
    NEW.pool_id := NULL;
  ELSIF NEW.pool_id IS NULL THEN
    SELECT graduation.pool_id
      INTO NEW.pool_id
    FROM indexer_v2.camp_graduations graduation
    WHERE graduation.chain_id = NEW.chain_id
      AND graduation.token_address = NEW.token_address;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER camp_trades_set_pool_id
BEFORE INSERT OR UPDATE OF chain_id, token_address, venue, pool_id
ON indexer_v2.camp_trades
FOR EACH ROW
EXECUTE FUNCTION indexer_v2.set_camp_trade_pool_id();

CREATE OR REPLACE FUNCTION indexer_v2.sync_camp_trade_pool_ids()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE indexer_v2.camp_trades
    SET pool_id = NULL
    WHERE chain_id = OLD.chain_id
      AND token_address = OLD.token_address
      AND venue = 1;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE'
    AND (OLD.chain_id, OLD.token_address) IS DISTINCT FROM (NEW.chain_id, NEW.token_address)
  THEN
    UPDATE indexer_v2.camp_trades
    SET pool_id = NULL
    WHERE chain_id = OLD.chain_id
      AND token_address = OLD.token_address
      AND venue = 1;
  END IF;

  UPDATE indexer_v2.camp_trades
  SET pool_id = NEW.pool_id
  WHERE chain_id = NEW.chain_id
    AND token_address = NEW.token_address
    AND venue = 1
    AND pool_id IS DISTINCT FROM NEW.pool_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER camp_graduations_sync_trade_pool_ids
AFTER INSERT OR UPDATE OR DELETE
ON indexer_v2.camp_graduations
FOR EACH ROW
EXECUTE FUNCTION indexer_v2.sync_camp_trade_pool_ids();

UPDATE indexer_v2.camp_trades trade
SET pool_id = graduation.pool_id
FROM indexer_v2.camp_graduations graduation
WHERE trade.chain_id = graduation.chain_id
  AND trade.token_address = graduation.token_address
  AND trade.venue = 1
  AND trade.pool_id IS DISTINCT FROM graduation.pool_id;

CREATE INDEX camp_trades_pool_timeline_idx
  ON indexer_v2.camp_trades (chain_id, pool_id, block_number DESC, log_index DESC)
  WHERE pool_id IS NOT NULL;

COMMENT ON COLUMN indexer_v2.camp_trades.emitter_address IS
  'Contract that emitted Trade: KorumCore for curve trades or KorumHook for pool trades.';
COMMENT ON COLUMN indexer_v2.camp_trades.pool_id IS
  'Uniswap v4 pool ID for venue=1, synchronized from camp_graduations.';
