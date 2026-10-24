-- Durable across Redis expiry/restarts and shared by all application replicas.
CREATE TABLE public.consumed_wallet_nonces (
  nonce_hash CHAR(64) PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX consumed_wallet_nonces_expiry_idx
  ON public.consumed_wallet_nonces (expires_at);
