# Versus token images

The creation form accepts files from the user's device only. Each token requires
an image. PNG, JPEG, WebP and GIF input is limited to **5 MiB** in both the browser
and the server's actual request stream (including chunked or dishonest requests).
The authenticated, same-origin `POST /api/token-images` endpoint also checks the
signed-in wallet and limits each user to 20 attempts per ten minutes.

The server decodes the bytes with Sharp, limits input to 25 megapixels, applies
EXIF orientation, centre-crops to **256 × 256**, strips metadata and outputs a
static **WebP**, quality 80, no larger than **100 KiB**. GIF and other animated
input uses its first frame. Alpha transparency is preserved. These are Korum's
logo conventions; ERC-20 does not specify image dimensions or encoding.

The normalized bytes go to [Pinata's v3 upload API](https://docs.pinata.cloud/api-reference/endpoint/upload-a-file)
with `network=public` and `cid_version=v1`. Only the server receives the JWT.
PostgreSQL stores the CID, SHA-256, Pinata file ID, byte count, dimensions, first
uploader wallet and timestamp in `public.token_images`; it stores no image bytes.
A content-hash transaction lock deduplicates concurrent/retried uploads. Identical
logos can share a CID: IPFS identifies content, not a token's identity.

The endpoint returns only after the DB commit. The form uploads both files before
simulation or wallet signing and supplies `ipfs://<cid>` as each camp's on-chain
URI. Failure on either upload prevents transaction submission; retrying reuses
previously stored images. An upload can remain unused after a cancelled launch.
A Pinata success followed by DB failure can leave an untracked pin; retries use
the same bytes/CID. Do not automatically unpin such files, since another token
may already reference the content.

Goldsky's existing `CampCreated` stream persists the URI alongside the chain,
Versus, camp side and token address in `indexer_v2.versus_camps`.
`public.versus_token_images` joins that authoritative projection with the image
records. No browser callback is needed to associate tokens, and indexer delay or
chain reorganizations cannot create a separately stale association. The existing
Versus queries use the persisted camp URIs for Explore, Watchlist, Versus detail
and Profile Managed Versus, resolved through the shared Pinata gateway helper.
Historical HTTPS and Arweave images remain supported for display.

## Configuration

1. Apply migration `0015_create_token_images.sql` using the existing migration
   runner: `npm run db:migrate`, with Railway's `DATABASE_URL` (or
   `DATABASE_PUBLIC_URL` for an external connection) injected into the process.
   The runner does not automatically load `.env.local`.
2. Add server-only `PINATA_JWT` with `org:files:write` permission in `.env.local`
   and the Railway application service. Never prefix it with `NEXT_PUBLIC_`.
3. Set `PINATA_GATEWAY` to your account's dedicated public gateway hostname or
   HTTPS URL, without access tokens. This is recommended: the fallback
   `https://gateway.pinata.cloud` can time out looking for newly uploaded files.
   The account gateway can serve its own public uploads without an access key.
4. Deploy/restart the application after configuration. No SDK dependency or
   Goldsky pipeline change is needed.

Run `npm run images:check` for real decoding/compression and mocked Pinata, DB,
route, client and creation-form checks. These checks do not upload live files or
send blockchain transactions. A real Pinata/Railway end-to-end check still requires
the configured services and a signed-in test wallet.
