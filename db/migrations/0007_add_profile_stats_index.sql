CREATE INDEX IF NOT EXISTS camp_trades_profile_stats_idx
  ON indexer.camp_trades (chain_id, trader_address)
  INCLUDE (token_address, eth_gross);
