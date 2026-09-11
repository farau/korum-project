CREATE FUNCTION referral_code_from_wallet(wallet TEXT)
RETURNS VARCHAR(6)
LANGUAGE SQL
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
  WITH RECURSIVE
  digest AS (
    SELECT DECODE(MD5(wallet), 'hex') AS bytes
  ),
  hash_value AS (
    SELECT (
      GET_BYTE(bytes, 0)::BIGINT * 1099511627776
      + GET_BYTE(bytes, 1)::BIGINT * 4294967296
      + GET_BYTE(bytes, 2)::BIGINT * 16777216
      + GET_BYTE(bytes, 3)::BIGINT * 65536
      + GET_BYTE(bytes, 4)::BIGINT * 256
      + GET_BYTE(bytes, 5)::BIGINT
    ) % 56800235584 AS value
    FROM digest
  ),
  encoded(position, value, code) AS (
    SELECT 0, value, ''::TEXT
    FROM hash_value
    UNION ALL
    SELECT
      position + 1,
      value / 62,
      SUBSTRING(
        '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
        FROM (value % 62)::INTEGER + 1
        FOR 1
      ) || code
    FROM encoded
    WHERE position < 6
  )
  SELECT code::VARCHAR(6)
  FROM encoded
  WHERE position = 6
$$;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evm_wallet VARCHAR(42) NOT NULL,
  referral_code VARCHAR(6) COLLATE "C"
    GENERATED ALWAYS AS (referral_code_from_wallet(evm_wallet)) STORED,
  referred_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  profile_bio VARCHAR(160),
  avatar_object_key VARCHAR(512),
  avatar_mime_type VARCHAR(100),
  avatar_updated_at TIMESTAMPTZ,
  x_user_id VARCHAR(64),
  x_username VARCHAR(50),
  x_linked_at TIMESTAMPTZ,
  last_login_chain_id BIGINT,
  last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_evm_wallet_unique UNIQUE (evm_wallet),
  CONSTRAINT users_referral_code_unique UNIQUE (referral_code),
  CONSTRAINT users_evm_wallet_lowercase CHECK (evm_wallet = LOWER(evm_wallet)),
  CONSTRAINT users_evm_wallet_format CHECK (evm_wallet ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT users_referral_code_format CHECK (referral_code ~ '^[A-Za-z0-9]{6}$'),
  CONSTRAINT users_profile_bio_not_blank CHECK (profile_bio IS NULL OR LENGTH(BTRIM(profile_bio)) > 0),
  CONSTRAINT users_avatar_metadata_complete CHECK (
    (avatar_object_key IS NULL AND avatar_mime_type IS NULL AND avatar_updated_at IS NULL)
    OR (avatar_object_key IS NOT NULL AND avatar_mime_type IS NOT NULL AND avatar_updated_at IS NOT NULL)
  ),
  CONSTRAINT users_x_metadata_complete CHECK (
    (x_user_id IS NULL AND x_username IS NULL AND x_linked_at IS NULL)
    OR (x_user_id IS NOT NULL AND x_username IS NOT NULL AND x_linked_at IS NOT NULL)
  ),
  CONSTRAINT users_not_self_referred CHECK (referred_by_user_id IS NULL OR referred_by_user_id <> id)
);

CREATE UNIQUE INDEX users_x_user_id_unique
  ON users (x_user_id)
  WHERE x_user_id IS NOT NULL;

CREATE UNIQUE INDEX users_x_username_unique
  ON users (LOWER(x_username))
  WHERE x_username IS NOT NULL;

CREATE INDEX users_referred_by_user_id_idx
  ON users (referred_by_user_id)
  WHERE referred_by_user_id IS NOT NULL;

CREATE INDEX users_last_login_at_idx ON users (last_login_at DESC);
