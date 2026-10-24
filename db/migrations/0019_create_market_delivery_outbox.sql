-- Atomic with the indexed trade and its aggregates; no global sequence cursor
-- that could skip a transaction committing out of order.
LOCK TABLE indexer_v2.camp_trades IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE indexer_v2.market_delivery_outbox (
  chain_id BIGINT NOT NULL,
  event_id TEXT NOT NULL,
  version UUID NOT NULL DEFAULT gen_random_uuid(),
  tokens TEXT[] NOT NULL,
  needs_reset BOOLEAN NOT NULL DEFAULT FALSE,
  first_pending_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, event_id)
);
CREATE INDEX market_delivery_outbox_pending_idx
  ON indexer_v2.market_delivery_outbox (chain_id, first_pending_at, event_id);
CREATE INDEX market_delivery_outbox_tokens_idx
  ON indexer_v2.market_delivery_outbox USING GIN (tokens);

CREATE FUNCTION indexer_v2.mark_market_delivery(p_chain BIGINT, p_event TEXT, p_token TEXT, p_reset BOOLEAN)
RETURNS VOID LANGUAGE SQL AS $$
  INSERT INTO indexer_v2.market_delivery_outbox (chain_id, event_id, tokens, needs_reset)
  VALUES (p_chain, p_event, ARRAY[p_token], p_reset)
  ON CONFLICT (chain_id, event_id) DO UPDATE SET
    version = gen_random_uuid(),
    needs_reset = indexer_v2.market_delivery_outbox.needs_reset OR EXCLUDED.needs_reset,
    tokens = ARRAY(SELECT DISTINCT token FROM unnest(indexer_v2.market_delivery_outbox.tokens || EXCLUDED.tokens) token ORDER BY token)
$$;
CREATE FUNCTION indexer_v2.track_market_delivery()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (to_jsonb(OLD) - 'ingested_at') = (to_jsonb(NEW) - 'ingested_at') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    PERFORM indexer_v2.mark_market_delivery(OLD.chain_id, OLD.event_id, OLD.token_address, TRUE);
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND (OLD.chain_id, OLD.event_id, OLD.token_address)
    IS DISTINCT FROM (NEW.chain_id, NEW.event_id, NEW.token_address) THEN
    PERFORM indexer_v2.mark_market_delivery(OLD.chain_id, OLD.event_id, OLD.token_address, TRUE);
  END IF;
  PERFORM indexer_v2.mark_market_delivery(NEW.chain_id, NEW.event_id, NEW.token_address, TG_OP = 'UPDATE');
  RETURN NEW;
END;
$$;
CREATE TRIGGER camp_trades_delivery_outbox_trigger
AFTER INSERT OR UPDATE OR DELETE ON indexer_v2.camp_trades
FOR EACH ROW EXECUTE FUNCTION indexer_v2.track_market_delivery();

-- Repair pre-existing warm caches once as well, including inactive markets.
INSERT INTO indexer_v2.market_delivery_outbox (chain_id, event_id, tokens, first_pending_at)
SELECT chain_id, '__bootstrap__:' || gen_random_uuid()::TEXT, ARRAY[token_address::TEXT], NOW() - INTERVAL '30 seconds'
FROM indexer_v2.versus_camps;
