# Korum

Korum is a Next.js application for creating and exploring tokenized matchups. Each matchup contains two opposing tokens. Users can follow market activity, compare both sides, simulate potential earnings, maintain a watchlist, and access wallet-linked profile data.

The current repository is a functional dApp connected to Robinhood Testnet contracts. Railway stores application data and Goldsky-indexed protocol projections for Versus metadata, market metrics and activity. Active curve charts use these projections; graduated charts use a verified DEX Screener embed on supported mainnet pools. Wallet connection is provided by RainbowKit and authenticated through a server-verified wallet signature.

## Testnet v2

Deployment addresses, launch IDs, database schema and cache version are selected by chain ID from `contracts/deployments/`. Testnet uses config `1`, native ETH only, and the economics ID returned by `KorumPairRegistry.resolve(address(0))` (currently `1`). Graduation is 0.042 ETH per camp, or 0.084 ETH across a Versus. Quotes now come from `KorumLens`; `KorumSeeder` handles graduation internally.

Apply migration `0011_create_v2_read_model.sql` before running this version. It preserves the old `indexer` schema and watchlists, and creates `indexer_v2` plus `user_watchlist_v2` so reset Versus IDs cannot refer to old contracts. Wallet profiles and avatars remain shared. The existing Goldsky pipeline now indexes v2 into the new schema; its source is `korum_deployment_v2_logs`. Deploy the frontend from this revision to complete the application rollout. Mainnet remains unconfigured and never inherits testnet addresses.

Read-only contract verification: `node --experimental-strip-types scripts/check-contracts-v2.mjs`.

## Live market delivery

Versus charts and the Explore ticker support authenticated Goldsky webhooks,
Redis Pub/Sub and one shared SSE connection per browser tab. Notifications are
published after PostgreSQL commits the corresponding event. Market snapshots
use revisioned Redis caches; polling remains enabled as a recovery path. Active
curve charts maintain shared 300-interval windows in Redis, with a five-minute
limit for the `1s` view. Graduation pauses trading and candle requests; once the
token is live, its chart switches to the verified DEX Screener pool embed.
Goldsky continues storing pool trades for analytics and market activity.
See [configuration, delivery semantics and rollout](docs/market-live.md).

## Creator fee recipient transfers

The Creator tab on each Versus reads the current recipient and any pending owner proposal from the contracts. The current recipient can transfer future fee rights for either camp to another wallet with `KorumFactory.transferCreatorFeeRecipient(token, newRecipient)`. Transferring both camps submits two separate wallet transactions. The original launch creator and fees already accrued to the previous recipient do not change.

Profile's Managed Versus tab lists camps whose indexed fee recipient is the signed-in wallet. Apply `db/migrations/0013_creator_fee_recipient_history.sql` before deploying this frontend or the updated `goldsky/pipelines/korum-robinhood-testnet.yaml`, then deploy the pipeline to backfill Factory recipient changes. Until Goldsky catches up, the Profile list can lag behind the on-chain recipient shown on the Versus page. A pending owner change remains pending after a direct transfer.

At creation, the publisher can enter a non-zero initial fee recipient for both camps; leaving the field empty uses the connected wallet. The form recommends a multisig or smart account because the current recipient can redirect future fees immediately. The protocol owner can propose a replacement for either camp, executable by anyone after three days and expiring three days later; the Versus page displays these proposals publicly and lets any connected wallet execute one during its window. A direct transfer does not cancel a pending owner proposal.

Either camp's **current on-chain fee recipient** can edit the Versus X, Telegram, Discord and website links from the Creator tab using a wallet message signature. Sign-in accepts EOA and smart-account signatures; the server verifies the session, edit signature and current contract rights before saving. Apply `db/migrations/0014_create_versus_socials_overrides.sql` before deploying this frontend. These edits live in `public.versus_socials_overrides`, outside Goldsky's `indexer_v2.versuses` projection, so a pipeline replay cannot erase them. Goldsky indexes the creation event and subsequent recipient-change events; it does not ingest later off-chain social edits.

## Current Status

- The interface and all canonical routes are in English.
- The Explore experience, filters, search, cards, ticker, analytics, leaderboard, earnings calculator, watchlist, wallet profile, and legal pages are implemented.
- Railway-indexed Versus are normalized into a typed frontend data contract at the server boundary.
- Wallet connection uses RainbowKit on the network selected by `NEXT_PUBLIC_KORUM_NETWORK`; testnet is operational and mainnet remains fail-closed until its deployment manifest is populated.
- Profile access requires a valid server-side session created from a verified wallet signature.
- Wallet identities, editable profile fields, and wallet-bound watchlists are persisted in a managed Railway PostgreSQL database.
- Trading and VS creation simulate contract calls before submitting wallet-confirmed transactions to the deployed Robinhood Testnet contracts.
- Goldsky indexes both curve and pool trades into Railway for current prices, volumes, market caps, adjusted FDVs, and recent activity. Korum Lightweight Charts generate candles only for active bonding curves.
- A private Railway Redis service caches public indexed reads, Alchemy quotes, and wallet-scoped Profile statistics across application replicas without becoming a source of truth.
- Explore, Versus details, Analytics, charts, and visible activity refresh automatically through Redis-backed HTTP reads without polling blockchain RPCs for indexed metrics.
- The Explore buy/sell ticker reads real indexed trades and spaces incoming results through a bounded client queue instead of displaying simultaneous bursts.
- The official Robinhood RPC is the primary frontend transport, with a server-proxied private Alchemy fallback that does not expose its credential to browsers.

## Main Features

- Responsive dark and light themes with a persisted preference.
- Animated background grid, moving light streaks, and a subtle pointer halo.
- Search across matchup names, token names, symbols, and categories.
- Category filters and sorting by trend, market cap, volume, traders, or launch date.
- Grid and table views for matchup discovery.
- Buy and sell card states for both matchup tokens.
- Graduation trading pause and verified DEX Screener charts after migration on mainnet; explicit waiting and unsupported-testnet states.
- Live indexed transaction ticker with green buy and red sell highlights and sequential reveal of polled events.
- Dedicated empty and unavailable states when the Goldsky/Railway read model returns no Versus or cannot be reached.
- Persistent Railway-backed watchlist synchronized across authenticated wallet sessions.
- Wallet-gated profile with information, activity, referral, badge, watchlist, and simulation tabs.
- Unique six-character Base62 referral code permanently associated with the connected EVM wallet.
- RainbowKit wallet modal with Wagmi SSR hydration.
- Nonce-based wallet authentication and signed `HttpOnly` session cookies.
- Atomic user creation on first verified wallet sign-in, with database-enforced wallet uniqueness.
- A real all-time trader leaderboard ranked by estimated PNL or indexed volume, with the highest Creator, Trader, or Referrer badge earned by each wallet.
- Interactive creator and referral earnings calculator.
- Protocol analytics and market breakdowns.
- Concept, fee waterfall, referral, privacy, and terms documentation.

## Technology

| Area | Technology |
| --- | --- |
| Framework | Next.js 16.3.4 with App Router |
| UI | React 19.2.8 |
| Language | TypeScript with strict mode |
| Styling | Global CSS and CSS custom properties |
| Linting | ESLint 9 with Next.js Core Web Vitals |
| Fonts | Geist and Geist Mono through `next/font` |
| Images | Next.js Image plus local reference assets |
| Persistence | Railway PostgreSQL for user data; browser storage for UI preferences and notification presentation |
| Wallet | RainbowKit with Wagmi |
| Authentication | Viem signature verification and signed server sessions |
| Database | Managed PostgreSQL on Railway through the `postgres` driver |
| Cache | Private Railway Redis through `ioredis`, with graceful source fallback |
| Indexing | Goldsky Turbo streaming Robinhood Testnet events into Railway |
| Charts | TradingView Lightweight Charts for active curves; verified DEX Screener iframe for graduated mainnet pools |
| USD quote | Alchemy Prices API, server-side only, with an explicit ETH fallback |

## Architecture Decisions

The accepted separation between application referral codes, the on-chain `ReferralRegistry`, Goldsky, and the Railway PostgreSQL read model is documented in [Referral and Indexer Architecture](./docs/referral-and-indexer-architecture.md). Read it before changing referral attribution, transaction arguments, indexer tables, or versus ingestion.

Contract ABI conventions and chain-specific public addresses are documented in [Contract Artifacts](./contracts/README.md).

## Requirements

- Node.js 20.9.0 or newer
- npm
- Network access during a clean production build so `next/font` can retrieve Geist

Create a local environment file before starting the application:

```bash
cp .env.example .env.local
```

Then provide the following values:

| Variable | Visibility | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Public | WalletConnect project ID used by RainbowKit |
| `NEXT_PUBLIC_APP_URL` | Public | Exact public origin used in sign-in messages, WalletConnect metadata, and server-side same-origin RPC URL construction |
| `NEXT_PUBLIC_KORUM_NETWORK` | Public | Build-time `testnet` or `mainnet` selection shared by contracts, wallet transport, and indexed reads |
| `KORUM_SESSION_SECRET` | Server only | HMAC secret containing at least 32 random bytes |
| `DATABASE_URL` | Server only | PostgreSQL connection URL supplied by Railway |
| `ALCHEMY_API_KEY` | Server only | ETH/USD quotes and construction of the default testnet Alchemy RPC fallback |
| `KORUM_ALCHEMY_RPC_URL` | Server only | Optional full Alchemy RPC override; required when enabling the mainnet fallback |
| `REDIS_URL` | Server only | Optional Redis connection; use the private `${{Redis.REDIS_URL}}` Railway reference |
| `KORUM_RPC_RATE_LIMIT` | Server only | Maximum JSON-RPC calls per client and rate window; defaults to `300` |
| `KORUM_RPC_RATE_WINDOW_SECONDS` | Server only | RPC rate-limit window in seconds; defaults to `60` |

Generate a session secret with:

```bash
openssl rand -hex 32
```

The repository includes a shared WalletConnect project ID fallback for localhost development. Configure your own project ID in production. `.env.local` is ignored by Git.

## Getting Started

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The root route redirects to `/explore`.

If port `3000` is already occupied, Next.js selects the next available port and prints it in the terminal.

## Available Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Turbopack development server |
| `npm run build` | Create an optimized Turbopack production build |
| `npm run build -- --webpack` | Create a production build with Webpack |
| `npm run start` | Serve an existing production build |
| `npm run lint` | Run ESLint across the repository |
| `npm run db:migrate` | Apply pending checksum-protected PostgreSQL migrations |
| `npm run db:check` | Test wallet upsert and referral invariants inside a rolled-back transaction |
| `npm run db:check:indexer` | Test referral, versus, trade, lifecycle, and locked-supply projections inside a rolled-back transaction |
| `npm run db:check:watchlist` | Test watchlist storage, indexed resolution, and user cascade inside a rolled-back transaction |
| `npm run auth:check` | Exercise wallet authentication, profile persistence, referrals, and watchlist API access with a disposable test account |
| `npx tsc --noEmit` | Run a standalone TypeScript check |
| `npx next typegen` | Regenerate typed App Router route definitions |
| `node scripts/check-graduated-markets.mjs` | Check graduation guards, pool discovery/cache behavior and chart switching in isolation; no external writes |

## Routes

| Route | Description |
| --- | --- |
| `/` | Redirects to `/explore` |
| `/explore` | Main discovery feed, search, filters, ticker, VS cards, and live-data empty state |
| `/vs/[id]` | Detail page for a specific matchup |
| `/earn` | Earning paths and interactive revenue calculator |
| `/leaderboard` | Paginated all-time trader rankings from indexed PNL and volume |
| `/concept` | Product mechanics, terminology, fees, and referrals |
| `/analytics` | Protocol and market analytics |
| `/create` | Contract-backed two-token VS creation flow |
| `/watchlist` | Matchups saved for the authenticated wallet |
| `/profile` | Wallet-gated account information, holdings, managed Versus, activity, referrals, badges, watchlist, and simulator |
| `/privacy` | Privacy Policy |
| `/terms` | Terms of Use |
| `/api/versus` | Cache-backed Railway projection for the live Versus list |
| `/api/versus/[id]` | Cache-backed reactive snapshot for one indexed Versus |
| `/api/versus/search` | Search indexed Versus |
| `/api/versus/[id]/positions` | Authenticated wallet positions for one Versus |
| `/api/markets/[token]/chart` | Active-curve price and market-cap OHLC; resolutions from `1s` to `180d`, plus `all`; returns `409` while graduating or live |
| `/api/markets/[token]/venue` | Indexed lifecycle and PoolId, with verified DEX Screener chart discovery for live tokens |
| `/api/markets/live` | Shared SSE delivery for token chart interests and the global trade feed |
| `/api/markets/[token]/trades` | Recent normalized trades preserving `venue=curve|pool` |
| `/api/markets/trades` | Global Redis-backed recent-trade feed used by the Explore ticker |
| `/api/rpc` | Same-origin, read-only and rate-limited proxy used only after the official Robinhood RPC fails |
| `/api/watchlist` | Authenticated Railway-backed watchlist reads and mutations |
| `/api/auth/challenge` | Creates a short-lived wallet sign-in challenge |
| `/api/auth/verify` | Verifies the wallet signature and creates a session |
| `/api/auth/session` | Reads or deletes the current wallet session |
| `/api/profile` | Authenticated wallet profile reads and username/bio updates |
| `/api/profile/activity` | Authenticated, Redis-backed Profile trade pagination |
| `/api/profile/holdings` | Authenticated on-chain balances and estimated USD values for known Korum holdings |
| `/api/profile/managed-versus` | Authenticated indexed camps currently paying creator fees to the wallet |
| `/api/leaderboard` | Public trader rankings; unfiltered pages use Redis while free-text searches query Railway directly |

Legacy French routes and the former `/index` route are intentionally not maintained. Internal links use the canonical English routes.

Public Versus and market endpoints expose `X-Korum-Cache` and `X-Korum-Cache-Layer` response headers. With the browser cache disabled, these identify Redis hits, Redis misses followed by PostgreSQL reads, in-process request deduplication, and Redis bypasses.

## Project Structure

```text
app/
├── api/                    # Public market, RPC, authentication, and wallet-data routes
├── components/             # Shared client and server components
│   ├── analytics/          # Analytics UI and data composition
│   └── explore/            # Search, filters, ticker, cards, and feed
├── hooks/                  # Reactive indexed-market and Railway-backed watchlist hooks
├── lib/                    # Typed models, cache, contracts, auth, and server database adapters
├── vs/[id]/                # Dynamic matchup route
├── */page.tsx              # App Router pages
├── globals.css             # Shared design system and responsive styles
└── layout.tsx              # Metadata, fonts, theme initialization
public/
└── korum-reference/        # Visual assets adapted from the reference design
```

The root layout mounts the SSR-aware RainbowKit and wallet providers. `PageWrapper` supplies the shared header and footer to application pages.

## Data Contract

The canonical frontend types for Railway-indexed responses live in `app/lib/debates.ts`. `app/lib/db/debates.ts` maps the normalized indexer projection into this browser-safe boundary.

Core `Debate` fields include:

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | `number` | Stable matchup identifier |
| `sideA`, `sideB` | `string` | Fallback display names for both sides |
| `category` | `string` | Filtering category |
| `sideAPercentage` | `number?` | Side A share; Side B is the remainder |
| `volume24h` | `number` | Combined 24-hour volume |
| `participantCount` | `number` | Distinct non-zero trade wallets across both camps |
| `holderCount` | `number?` | Combined holder count |
| `marketCapA`, `marketCapB` | `number?` | Side-level current price multiplied by circulating supply |
| `tokenA`, `tokenB` | `DebateToken?` | Detailed token records |
| `createdAtUtc`, `launchedAtUtc` | `string?` | ISO 8601 UTC dates |
| `createdAtTimestamp`, `launchTimestamp` | `number?` | Unix timestamps in milliseconds |
| `imageRefA`, `imageRefB` | `string?` | API-ready image references |
| `creatorAddress` | `string?` | Creator EVM address |

Each `DebateToken` can provide identity, chain, pricing, supply, market cap, adjusted FDV, liquidity, holder, trader, trade, launch, image, and creator fields. Before graduation, market cap uses only tokens released from the bonding curve; virtual ETH affects the indexed spot price but is not added to the circulating valuation. Components prefer nested token values and use matchup-level values where appropriate.

Example response shape:

```json
{
  "id": 1,
  "sideA": "A",
  "sideB": "B",
  "category": "Other",
  "sideAPercentage": 50,
  "volume24h": 0.015,
  "participantCount": 1,
  "marketCapA": 2.4,
  "marketCapB": 2.3,
  "createdAtUtc": "2026-09-15T10:00:00.000Z",
  "tokenA": {
    "name": "A",
    "symbol": "A",
    "chainId": 46630,
    "marketCap": 2.4
  }
}
```

Treat this type as the frontend boundary. Avoid adding temporary aliases for database column names; normalize indexed rows in the server-only adapter before returning them to components. Explore and Analytics share its reactive client query, while watchlist membership remains an authenticated database read.

## Wallet Authentication

The wallet layer uses RainbowKit, Wagmi, Viem, and React Query. RainbowKit receives a custom authentication adapter while Wagmi receives its initial cookie state from the root server layout.

Authentication follows this flow:

1. The user connects an EVM wallet through RainbowKit.
2. RainbowKit requests a five-minute, server-signed nonce, then asks the server to construct the exact challenge message for the connected address and chain.
3. The wallet signs that message without submitting a transaction.
4. The server verifies the nonce, origin, expiration, address, network, message, and EVM signature.
5. PostgreSQL atomically creates the wallet user or updates the existing user's last-login metadata.
6. The server creates a signed 12-hour session cookie containing the internal user ID and wallet address.
7. Server Components and private API routes require both signed identifiers before reading or updating a profile.

The session cookie is `HttpOnly`, `SameSite=Strict`, scoped to `/`, and marked `Secure` in production. It contains only a signed session identifier, wallet address, chain ID, and timestamps. It never contains profile records, private keys, signatures, or Railway credentials.

The challenge cookie is also `HttpOnly`, short-lived, and limited to `/api/auth`. It is deleted after successful verification. Disconnecting through the Korum header deletes the authenticated session as well as the RainbowKit connection.

`/profile` reads the session on the server and does not send profile data to unauthenticated clients. `/api/profile` applies the same protection to profile reads, indexed wallet statistics, and username/bio updates. Every future wallet-specific Railway query must repeat this server-side authorization check; hiding content in React is not a security boundary.

The current profile mirrors the Korum reference layout while keeping its controls reactive. Its Information, My Holdings, Activity, Referrals, Badges, Watchlist, and Global simulator tabs are client-side React views. The server derives referral count from `indexer_v2.referral_bindings`, created Versus from `indexer_v2.versuses`, joined Versus from indexed trades, and trade count, gross volume, net positions, and cash flow from the trigger-maintained `indexer_v2.trader_totals` and `indexer_v2.trader_positions` aggregates. Every read is scoped to the configured chain and authenticated wallet. These wallet-scoped statistics are cached for 20 seconds in the private server-side Redis service under a hashed wallet key; the authenticated Profile response remains `private, no-store` and is never stored by a shared HTTP cache. Activity is loaded lazily in pages of 10 raw trades through `/api/profile/activity`, with a separate 20-second private Redis entry for each wallet and page. Gross volume is displayed in USD with the shared ETH/USD quote, falling back to ETH when no quote is available. Estimated PNL is sales received net of fees plus the full-position liquidation value of each remaining trade-derived position minus purchases paid. For an active curve, the server reconstructs `KorumLens.quoteSell` locally from indexed reserves and reads only the public launch configuration on-chain; it therefore includes bonding-curve price impact and current sell fees without disclosing position sizes to an RPC provider. It excludes gas and cannot account for ERC-20 transfers outside Korum until `Transfer` events are indexed. My Holdings uses traded token addresses as candidates, verifies each current `balanceOf` on-chain, and combines priced curve positions with the native ETH balance using the shared ETH/USD quote. It does not discover tokens received without any trade in the wallet, and a total is withheld when a known position cannot be valued or the candidate limit is reached. My Holdings estimates graduated positions from the latest indexed pool spot price (or the graduation price before the first pool trade), without selling fees or price impact; executable liquidation valuation still requires pool quoting. Badge progression is derived from the seven threshold pairs shown in Profile: Creator uses created Versus plus generated curve volume, Trader uses trade count plus gross volume, and Referrer uses confirmed referrals plus their wallets' gross volume. Both conditions are required within a path, and the highest tier reached across the three paths becomes the public leaderboard badge. The tier itself is not persisted because thresholds and the ETH/USD conversion can change; authoritative counters and volumes remain in Railway. Profile-image uploads are available in Account information; X account linking remains disabled.

## User Database

The user schema is defined by the numbered migrations in `db/migrations`. The `users` table stores:

- A generated UUID primary key.
- A lowercase, format-checked, unique EVM wallet.
- A generated and unique six-character Base62 referral code bound to the normalized EVM wallet.
- An optional editable display name between 2 and 32 characters.
- A 160-character profile bio.
- Avatar version metadata and verified X account metadata.
- Last-login chain and timestamps, plus creation and update timestamps.

Wallet addresses and referral codes are immutable through the Profile API. On first verified sign-in, the server generates exactly six cryptographically random Base62 characters and retries if PostgreSQL reports the unique code constraint. Subsequent sign-ins preserve the code already bound to that wallet. `POST /api/auth/verify` performs an atomic `INSERT ... ON CONFLICT DO UPDATE`, so concurrent sign-ins for the same wallet resolve to one user record. `GET` and `PATCH /api/profile` derive identity only from the signed session. Profile updates use a strict field allowlist and allow one validated `displayName` or `bio` change per request.

The referrer is deliberately not stored on `users`. `ReferralRegistry.referrerOf(user)` remains the on-chain source of truth, while Goldsky projects successful `ReferrerBound` events into PostgreSQL for fast reverse lookups, rankings, and historical reads.

Referral links can add a case-sensitive six-character code through `?ref=ABC123` on any application page. Next.js removes the code from the visible URL, validates it against `users`, and stores only the code in a 30-day `HttpOnly`, `SameSite=Lax` cookie. Authenticated transaction screens resolve that code back to its wallet server-side through `/api/referrals/pending`. Invalid codes and self-referrals are ignored. After an eligible transaction, the client clears the cookie only when `ReferrerBound` is present in the receipt or `ReferralRegistry.referrerOf(user)` is non-zero. See the [architecture decision](./docs/referral-and-indexer-architecture.md#cookie-lifecycle) for the complete lifecycle.

### Referrer identity and reciprocal referrals

Profile displays the confirmed `ReferralRegistry.referrerOf(wallet)` address and the referrer's display name when available. A pending referral cookie is not a confirmed referrer. RPC failures show an unavailable state instead of claiming there is no referrer.

Before resolving a pending referral, the server reads the current user's on-chain referrer and rejects self-referrals and already-bound users. Reciprocal referrals are allowed: A can refer B and B can refer A, provided each user has no referrer when their binding is created. Creation and trade submission resolve the referral again, checking that the API session wallet matches the submitting wallet. A failed verification submits no new referrer and preserves the pending cookie for retry.

The application follows the deployed registry's binding rules: no zero-address referrer, no self-referral and no replacement of an existing referrer. No contract change is needed to allow reciprocal referrals.

Run `node --experimental-strip-types scripts/check-referral-eligibility.mjs` for the reciprocal-referral and session-mismatch checks.

### Profile avatars

Migration `0010_create_user_avatars.sql` stores one compressed WebP per user in a separate `user_avatars` table (`BYTEA`, maximum 100 KiB enforced by PostgreSQL). This keeps binary payloads out of ordinary profile queries and avoids bucket credentials and orphaned objects for these small, bounded assets. If avatar traffic or user count grows substantially, migrate the binary storage to object storage while preserving the public image route.

`PUT /api/profile/avatar` accepts raw JPEG, PNG or WebP bytes, with a 5 MiB streaming request limit. Sharp validates the decoded format, rejects animated images and images over 25 megapixels, applies EXIF orientation, crops to 256 × 256, strips metadata and encodes WebP at quality 80 before any database write. See [Sharp's input limits](https://sharp.pixelplumbing.com/api-constructor/) and [output options](https://sharp.pixelplumbing.com/api-output/). `DELETE` removes the image. Both require a signed wallet session, check request origin and share a limit of 10 attempts per 10 minutes per user through the existing Redis limiter (in-process fallback without Redis). Image bytes and user metadata change in one transaction.

`GET /api/avatars/:wallet` serves public profile images with `Cache-Control: no-store`, or 404 for the initials fallback. Profile and avatar components reset their local state on wallet changes, and profile identity must match both the connected wallet and the signed server session. The shared avatar component refreshes mounted avatars immediately after upload/removal, including the header. No additional environment variables are needed; apply the migration before releasing the application changes.

Checks (Node 22.6+ for the TypeScript image test):

```bash
node --experimental-strip-types scripts/check-avatar-images.mjs
node --env-file=.env.local scripts/check-avatar-flow.mjs
```

The flow check requires the local app and a migrated development/staging database. It signs in two temporary wallets, verifies their profiles and images stay isolated, tests upload/read/replace/delete/rate limits and deletes the test users afterward.

## Goldsky Read Model

Migration `0002_create_indexer_read_model.sql` creates the isolated `indexer_v2` schema in the Railway PostgreSQL database. Migration `0005_create_market_read_model.sql` adds trade and curve-lifecycle projections, `0006_add_trade_feed_index.sql` adds the ticker timeline index, `0007_add_profile_stats_index.sql` adds the wallet-oriented Activity index, `0008_create_trader_aggregates.sql` adds incrementally maintained trader totals and positions, and `0009_fix_trader_aggregate_deltas.sql` makes replay updates and deletions constraint-safe:

- `indexer_v2.referral_bindings` mirrors confirmed `ReferrerBound` events, keyed by chain and referred wallet.
- `indexer_v2.versuses` mirrors `VersusCreated`, including the descriptive strings that are emitted but not stored by the contract.
- `indexer_v2.versus_camps` mirrors both `CampCreated` events, including token metadata and launch parameters.
- `indexer_v2.camp_trades` stores normalized pre-bonding and post-bonding trades with their exact event provenance.
- `indexer_v2.camp_curve_lifecycle` and `indexer_v2.camp_graduations` reconstruct venue status and the structurally locked residual supply.
- `indexer_v2.camp_market_state` exposes the latest trade state, circulating supply, adjusted FDV supply, and lifecycle state for server-side market calculations.
- `indexer_v2.trader_totals` and `indexer_v2.trader_positions` are transactionally updated by a `camp_trades` trigger and backfilled from the historical trade model.

Goldsky owns writes to the `indexer_v2` schema; the application owns `public.users` and `public.user_watchlist_v2`. The indexer tables do not reference `users` because an on-chain participant may never create a Korum profile. Camps also have no foreign key to `versuses`: the factory emits both `CampCreated` logs before `VersusCreated`, and independent sink writes must remain valid in that order.

The deployed Goldsky pipeline lowercases every EVM address and hash, converts event timestamps to UTC `timestamptz`, and starts from the earliest relevant deployment block. PostgreSQL sinks upsert through table-aligned keys so replayed logs remain idempotent. Changes to addresses, event signatures, or projections require updating the canonical ABI/manifest, validating the committed pipeline, applying it explicitly, and verifying the resulting staging events.

Goldsky can write these projections directly into Railway PostgreSQL through its externally reachable connection URL. The frontend must still read them through server-side Korum queries or API routes; neither the browser nor the smart contracts write directly to PostgreSQL.

The migration runner serializes concurrent runs with a PostgreSQL advisory lock and stores each migration checksum in `korum_schema_migrations`. Never edit an applied migration; add a new numbered file instead.

For local access without a public database proxy, open a Railway SSH tunnel and run commands with the database service variables:

```bash
railway connect Postgres --tunnel-only --port 15432
railway run --service Postgres env KORUM_DB_TUNNEL_HOST=127.0.0.1 KORUM_DB_TUNNEL_PORT=15432 npm run db:migrate
```

In a deployed Railway application service, set `DATABASE_URL` to the private `${{Postgres.DATABASE_URL}}` reference.

## Browser Persistence

| Key | Value |
| --- | --- |
| `korum-theme` | `dark` or `light` |
| `korum-notifications-v2:<wallet-or-anonymous>` | Bounded notification history isolated by normalized wallet address, with a separate anonymous scope |

The watchlist is not browser persistence: its source of truth is `public.user_watchlist_v2` in Railway and its cross-tab refresh signal uses `BroadcastChannel` without storing membership locally. Reads of genuine browser preferences are deferred until client hydration to avoid server/client markup mismatches.

Wagmi and the authenticated session additionally use cookies. The signed session cookie is intentionally unavailable through browser JavaScript.

## Styling and Assets

The visual system is primarily defined in `app/globals.css`. Theme values use CSS custom properties selected through the `data-theme` attribute on the root HTML element.

Reference media is stored in `public/korum-reference`. Production image domains must be added to `images.remotePatterns` before optimized remote images are introduced.

## Railway Integration

The implemented integration rules are:

1. Keep the `Debate` and `DebateToken` interfaces as the frontend contract.
2. Read `indexer_v2.*` only through the server adapters in `app/lib/db`; browsers use Route Handlers or serialized Server Component data.
3. Normalize timestamps, nullable fields, token units, prices, market caps, adjusted FDVs, and event venues at that boundary.
4. Use the Redis-backed public endpoints and shared TanStack Query keys for reactive market reads.
5. Preserve loading, empty, and API-error states on every data-driven page.
6. Keep database, Redis, Alchemy, and signing secrets server-side and expose only explicitly public `NEXT_PUBLIC_*` configuration.
7. Call `getWalletSession()` before every wallet-specific query and use `session.address`, never an address supplied by the browser.
8. Treat PostgreSQL indexer rows as query projections; contract state and confirmed receipts remain authoritative for transaction correctness.

Do not place Railway credentials, private keys, RPC secrets, or signing material in source control.

## Quality Checks

Run these commands before opening a pull request:

```bash
npx next typegen
npx tsc --noEmit
npm run lint
npm run build -- --webpack
```

The Webpack build command is useful as a fallback in restricted environments where Turbopack workers cannot bind an internal port.

## Known Limitations

- Creator/referrer ranking models and analytics projections are not yet backed by dedicated indexed aggregates; the trader leaderboard is live.
- My Holdings discovers tokens from the wallet's indexed trades, so transferred-in tokens never traded by that wallet are omitted. Graduated tokens use the latest indexed pool spot price (or the graduation price before the first pool trade) times the on-chain balance; this market estimate does not include selling fees or price impact. Profile PNL remains a trade-derived estimate excluding transfers and gas.
- Profile-image uploads and X account linking are intentionally disabled.
- Advanced numeric filters and quick-amount configuration are visual placeholders.
- Automated unit, integration, and end-to-end tests have not been added yet.
- The current signature verifier supports standard EVM account signatures; contract-wallet authentication requires an ERC-1271-aware verifier before production use.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for notable project changes.

## License

No open-source license is currently declared. All rights remain with Korum Labs unless a license file is added.
