CREATE TABLE user_watchlist (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chain_id BIGINT NOT NULL,
  versus_id NUMERIC(78, 0) NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, chain_id, versus_id),
  CONSTRAINT user_watchlist_chain_id_positive CHECK (chain_id > 0),
  CONSTRAINT user_watchlist_versus_id_nonnegative CHECK (versus_id >= 0)
);

CREATE INDEX user_watchlist_versus_idx
  ON user_watchlist (chain_id, versus_id);
