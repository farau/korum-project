-- Reserve uploads briefly in SQL; never hold a connection while calling Pinata.
CREATE TABLE public.token_image_upload_leases (
  sha256 VARCHAR(64) COLLATE "C" PRIMARY KEY CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  owner UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX token_image_upload_leases_expiry_idx ON public.token_image_upload_leases (expires_at);
