CREATE INDEX IF NOT EXISTS camp_trades_chain_timeline_idx
  ON indexer.camp_trades (chain_id, block_number DESC, log_index DESC);
