-- Image bytes live on public IPFS, never in PostgreSQL. Keep uploads separate
-- from Goldsky-owned projections; cancelled launches remain reusable uploads.
CREATE TABLE public.token_images (
  sha256 VARCHAR(64) COLLATE "C" PRIMARY KEY CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  cid VARCHAR(128) COLLATE "C" NOT NULL UNIQUE CHECK (cid ~ '^b[a-z2-7]{20,120}$'),
  pinata_file_id VARCHAR(128) NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 102400),
  mime_type TEXT NOT NULL DEFAULT 'image/webp' CHECK (mime_type = 'image/webp'),
  width INTEGER NOT NULL DEFAULT 256 CHECK (width = 256),
  height INTEGER NOT NULL DEFAULT 256 CHECK (height = 256),
  uploaded_by_wallet VARCHAR(42) COLLATE "C" NOT NULL CHECK (uploaded_by_wallet ~ '^0x[0-9a-f]{40}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Chain/versus/side/token associations are derived from confirmed indexed
-- events, and therefore survive navigation, indexer delay and reorgs.
CREATE VIEW public.versus_token_images AS
SELECT camp.chain_id, camp.versus_id, camp.side, camp.token_address,
  image.cid, image.sha256, image.byte_size, image.mime_type, image.width, image.height
FROM indexer_v2.versus_camps camp
JOIN public.token_images image ON camp.uri = 'ipfs://' || image.cid;
