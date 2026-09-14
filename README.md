# Korum

Korum is a Next.js application for creating and exploring tokenized matchups. Each matchup contains two opposing tokens. Users can follow market activity, compare both sides, simulate potential earnings, maintain a watchlist, and access wallet-linked profile data.

The current repository is a functional dApp connected to Robinhood Testnet contracts. Railway stores application data and Goldsky-indexed protocol projections; deterministic mock market data remains available only through the explicit development switch. Wallet connection is provided by RainbowKit and authenticated through a server-verified wallet signature.

## Current Status

- The interface and all canonical routes are in English.
- The Explore experience, filters, search, cards, ticker, analytics, leaderboard, earnings calculator, watchlist, wallet profile, and legal pages are implemented.
- Mock debates and Railway-indexed Versus share the same typed frontend data contract.
- Wallet connection uses RainbowKit on the network selected by `NEXT_PUBLIC_KORUM_NETWORK`; testnet is operational and mainnet remains fail-closed until its deployment manifest is populated.
- Profile access requires a valid server-side session created from a verified wallet signature.
- Wallet identities, editable profile fields, and wallet-bound watchlists are persisted in a managed Railway PostgreSQL database.
- Trading and VS creation simulate contract calls before submitting wallet-confirmed transactions to the deployed Robinhood Testnet contracts.
- Goldsky indexes both curve and pool trades into Railway for market charts, current prices, volumes, market caps, adjusted FDVs, and recent activity.
- A private Railway Redis service caches public indexed reads and Alchemy quotes across application replicas without becoming a source of truth.
- Explore, Versus details, Analytics, charts, and visible activity refresh automatically through Redis-backed HTTP reads without polling blockchain RPCs for indexed metrics.
- The Explore buy/sell ticker reads real indexed trades and spaces batched polling results through a client queue instead of displaying simultaneous bursts.
- The official Robinhood RPC is the primary frontend transport, with a server-proxied private Alchemy fallback that does not expose its credential to browsers.

## Main Features

- Responsive dark and light themes with a persisted preference.
- Animated background grid, moving light streaks, and a subtle pointer halo.
- Search across matchup names, token names, symbols, and categories.
- Category filters and sorting by trend, market cap, volume, traders, or launch date.
- Grid and table views for matchup discovery.
- Buy and sell card states for both matchup tokens.
- Live indexed transaction ticker with green buy and red sell highlights and sequential reveal of polled events.
- Mock data switch for testing the Explore feed without a backend.
- Dedicated empty state when mock data is disabled and the live source returns no versus.
- Persistent Railway-backed watchlist synchronized across authenticated wallet sessions.
- Wallet-gated profile with information, activity, referral, badge, watchlist, and simulation tabs.
- Unique six-character Base62 referral code permanently associated with the connected EVM wallet.
- RainbowKit wallet modal with Wagmi SSR hydration.
- Nonce-based wallet authentication and signed `HttpOnly` session cookies.
- Atomic user creation on first verified wallet sign-in, with database-enforced wallet uniqueness.
- Trader, creator, and referrer leaderboard views.
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

## Routes

| Route | Description |
| --- | --- |
| `/` | Redirects to `/explore` |
| `/explore` | Main discovery feed, search, filters, ticker, VS cards, and live-data empty state |
| `/vs/[id]` | Detail page for a specific matchup |
| `/earn` | Earning paths and interactive revenue calculator |
| `/leaderboard` | Trader, creator, and referrer rankings |
| `/concept` | Product mechanics, terminology, fees, and referrals |
| `/analytics` | Protocol and market analytics |
| `/create` | Contract-backed two-token VS creation flow |
| `/watchlist` | Matchups saved for the authenticated wallet |
| `/profile` | Wallet-gated account information, activity, referrals, badges, watchlist, and simulator |
| `/privacy` | Privacy Policy |
| `/terms` | Terms of Use |
| `/api/debates` | Cache-backed Railway projection for the live Versus list |
| `/api/debates/[id]` | Cache-backed reactive snapshot for one indexed Versus |
| `/api/markets/[token]/chart` | Railway-backed ETH price/volume history; accepts `range=1h|1d|7d|30d|180d` |
| `/api/markets/[token]/trades` | Recent normalized trades preserving `venue=curve|pool` |
| `/api/markets/trades` | Global Redis-backed recent-trade feed used by the Explore ticker |
| `/api/rpc` | Same-origin, read-only and rate-limited proxy used only after the official Robinhood RPC fails |
| `/api/watchlist` | Authenticated Railway-backed watchlist reads and mutations |
| `/api/auth/challenge` | Creates a short-lived wallet sign-in challenge |
| `/api/auth/verify` | Verifies the wallet signature and creates a session |
| `/api/auth/session` | Reads or deletes the current wallet session |
| `/api/profile` | Authenticated wallet profile reads and username/bio updates |

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
├── lib/                    # Typed models, fixtures, cache, contracts, auth, and server database adapters
├── vs/[id]/                # Dynamic matchup route
├── */page.tsx              # App Router pages
├── globals.css             # Shared design system and responsive styles
└── layout.tsx              # Metadata, fonts, theme initialization
public/
└── korum-reference/        # Visual assets adapted from the reference design
```

The root layout mounts the SSR-aware RainbowKit and wallet providers. `PageWrapper` supplies the shared header, footer, and mock-data provider to application pages.

## Data Contract

The canonical frontend types shared by mock fixtures and Railway-indexed responses live in `app/lib/debates.ts`. `getDebates()` enriches a compact deterministic fixture for explicit demo mode, while `app/lib/db/debates.ts` maps the live indexer projection into the same boundary.

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
  "sideA": "Messi",
  "sideB": "Ronaldo",
  "category": "Sports",
  "sideAPercentage": 55,
  "volume24h": 89200,
  "participantCount": 1050,
  "marketCapA": 117744,
  "marketCapB": 96336,
  "createdAtUtc": "2026-09-03T16:00:00.000Z",
  "tokenA": {
    "name": "Messi",
    "symbol": "$MESS",
    "chainId": 46630,
    "marketCap": 117744
  }
}
```

Treat this type as the frontend boundary for both data sources. Avoid adding temporary aliases for database column names; normalize indexed rows in the server-only adapter before returning them to components.

## Mock Data

The `Mock data` switch is available in the header and persists its value under `korum-mock`.

- Enabled: the Explore cards and animated activity ticker use `getDebates()`.
- Disabled: the mock cards and ticker are hidden. If the live source returns no records, Explore displays a dedicated `No versus available yet` state.
- `/api/debates` returns the Railway-indexed live read model; mock fixtures never replace this endpoint.
- Explore and Analytics share its reactive client query, while watchlist membership remains an authenticated database read.

Mock timestamps use a fixed UTC reference date so server and client output remains deterministic during hydration.

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

`/profile` reads the session on the server and does not send profile data to unauthenticated clients. `/api/profile` applies the same protection to profile reads and username/bio updates. Every future wallet-specific Railway query must repeat this server-side authorization check; hiding content in React is not a security boundary.

The current profile mirrors the Korum reference layout while keeping its controls reactive. Its Information, Activity, Referrals, Badges, Watchlist, and Global simulator tabs are client-side React views. Wallet-specific metrics without a dedicated aggregate still display `Awaiting indexer`; market-level Railway projections do not fabricate per-wallet performance. Profile-image uploads and X account linking are visibly disabled and cannot be activated by pointer or keyboard.

## User Database

The user schema is defined by the numbered migrations in `db/migrations`. The `users` table stores:

- A generated UUID primary key.
- A lowercase, format-checked, unique EVM wallet.
- A generated and unique six-character Base62 referral code bound to the normalized EVM wallet.
- An optional editable display name between 2 and 32 characters.
- A 160-character profile bio.
- Future avatar object metadata and verified X account metadata.
- Last-login chain and timestamps, plus creation and update timestamps.

Wallet addresses and referral codes are immutable through the Profile API. On first verified sign-in, the server generates exactly six cryptographically random Base62 characters and retries if PostgreSQL reports the unique code constraint. Subsequent sign-ins preserve the code already bound to that wallet. `POST /api/auth/verify` performs an atomic `INSERT ... ON CONFLICT DO UPDATE`, so concurrent sign-ins for the same wallet resolve to one user record. `GET` and `PATCH /api/profile` derive identity only from the signed session. Profile updates use a strict field allowlist and allow one validated `displayName` or `bio` change per request.

The referrer is deliberately not stored on `users`. `ReferralRegistry.referrerOf(user)` remains the on-chain source of truth, while Goldsky projects successful `ReferrerBound` events into PostgreSQL for fast reverse lookups, rankings, and historical reads.

Referral links can add a case-sensitive six-character code through `?ref=ABC123` on any application page. Next.js removes the code from the visible URL, validates it against `users`, and stores only the code in a 30-day `HttpOnly`, `SameSite=Lax` cookie. Authenticated transaction screens resolve that code back to its wallet server-side through `/api/referrals/pending`. Invalid codes and self-referrals are ignored. After an eligible transaction, the client clears the cookie only when `ReferrerBound` is present in the receipt or `ReferralRegistry.referrerOf(user)` is non-zero. See the [architecture decision](./docs/referral-and-indexer-architecture.md#cookie-lifecycle) for the complete lifecycle.

## Goldsky Read Model

Migration `0002_create_indexer_read_model.sql` creates the isolated `indexer` schema in the Railway PostgreSQL database. Migration `0005_create_market_read_model.sql` adds trade and curve-lifecycle projections, and `0006_add_trade_feed_index.sql` adds the timeline index used by the global ticker:

- `indexer.referral_bindings` mirrors confirmed `ReferrerBound` events, keyed by chain and referred wallet.
- `indexer.versuses` mirrors `VersusCreated`, including the descriptive strings that are emitted but not stored by the contract.
- `indexer.versus_camps` mirrors both `CampCreated` events, including token metadata and launch parameters.
- `indexer.camp_trades` stores normalized pre-bonding and post-bonding trades with their exact event provenance.
- `indexer.camp_curve_lifecycle` and `indexer.camp_graduations` reconstruct venue status and the structurally locked residual supply.
- `indexer.camp_market_state` exposes the latest trade state, circulating supply, adjusted FDV supply, and lifecycle state for server-side market calculations.

Goldsky owns writes to the `indexer` schema; the application owns `public.users` and `public.user_watchlist`. The indexer tables do not reference `users` because an on-chain participant may never create a Korum profile. Camps also have no foreign key to `versuses`: the factory emits both `CampCreated` logs before `VersusCreated`, and independent sink writes must remain valid in that order.

The deployed Goldsky pipeline lowercases every EVM address and hash, converts event timestamps to UTC `timestamptz`, and starts from the earliest relevant deployment block. PostgreSQL sinks upsert through table-aligned keys so replayed logs remain idempotent. Changes to addresses, event signatures, or projections require updating the canonical ABI/manifest, validating the committed pipeline, applying it explicitly, and verifying the resulting staging events.

Goldsky can write these projections directly into Railway PostgreSQL through its externally reachable connection URL. The frontend must still read them through server-side Korum queries or API routes; neither the browser nor the smart contracts write directly to PostgreSQL.

The migration runner serializes concurrent runs with a PostgreSQL advisory lock and stores each migration checksum in `korum_schema_migrations`. Never edit an applied migration; add a new numbered file instead.

For local access without a public database proxy, open a Railway SSH tunnel and run commands with the database service variables:

```bash
railway connect Postgres --tunnel-only --port 15432
railway run --service Postgres env KORUM_DB_TUNNEL_HOST=127.0.0.1 KORUM_DB_TUNNEL_PORT=15432 npm run db:migrate
```

In a deployed Railway application service, set `DATABASE_URL` to the private `${{Postgres.DATABASE_URL}}` reference.

## Profile Image Strategy

The recommended first implementation is a private Railway Bucket with S3-compatible signed uploads. PostgreSQL should store only an immutable object key and validated metadata, never image bytes or a temporary presigned URL.

A production avatar flow should:

1. Require a valid wallet session before issuing a short-lived upload authorization.
2. Generate a random user-scoped temporary key instead of trusting the original filename.
3. Limit accepted formats, encoded size, decoded dimensions, and pixel count.
4. Verify the actual file signature, strip metadata, resize, and re-encode to a canonical WebP or AVIF asset.
5. Move the validated asset to an immutable key and update the user row only after storage succeeds.
6. Delete replaced and abandoned objects asynchronously.

Cloudflare Images or Cloudinary are stronger alternatives when automatic transformations, global image delivery, moderation, or responsive variants matter more than keeping storage inside Railway. X account linking should use an OAuth flow and persist only provider IDs and verified metadata after callback validation.

## Browser Persistence

| Key | Value |
| --- | --- |
| `korum-theme` | `dark` or `light` |
| `korum-mock` | Mock feed preference |
| `korum-notifications-v1` | Bounded notification presentation history |

The watchlist is not browser persistence: its source of truth is `public.user_watchlist` in Railway and its cross-tab refresh signal uses `BroadcastChannel` without storing membership locally. Reads of genuine browser preferences are deferred until client hydration to avoid server/client markup mismatches.

Wagmi and the authenticated session additionally use cookies. The signed session cookie is intentionally unavailable through browser JavaScript.

## Styling and Assets

The visual system is primarily defined in `app/globals.css`. Theme values use CSS custom properties selected through the `data-theme` attribute on the root HTML element.

Reference media is stored in `public/korum-reference`. Remote mock token images currently use `https://picsum.photos`, allowed through `next.config.ts`. Production image domains must be added to `images.remotePatterns` before optimized remote images are introduced.

## Railway Integration

The implemented integration rules are:

1. Keep the `Debate` and `DebateToken` interfaces as the frontend contract.
2. Read `indexer.*` only through the server adapters in `app/lib/db`; browsers use Route Handlers or serialized Server Component data.
3. Normalize timestamps, nullable fields, token units, prices, market caps, adjusted FDVs, and event venues at that boundary.
4. Keep `getDebates()` exclusively as the explicit mock/demo source and never use it as a silent fallback for live IDs.
5. Use the Redis-backed public endpoints and shared TanStack Query keys for reactive market reads.
6. Preserve loading, empty, and API-error states on every data-driven page.
7. Keep database, Redis, Alchemy, and signing secrets server-side and expose only explicitly public `NEXT_PUBLIC_*` configuration.
8. Call `getWalletSession()` before every wallet-specific query and use `session.address`, never an address supplied by the browser.
9. Treat PostgreSQL indexer rows as query projections; contract state and confirmed receipts remain authoritative for transaction correctness.

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

- Leaderboard rows and analytics projections are deterministic prototype values.
- Wallet-specific profile activity, badge, and position metrics remain empty until dedicated indexed aggregates are implemented.
- Profile-image uploads and X account linking are intentionally disabled.
- Advanced numeric filters and quick-amount configuration are visual placeholders.
- Automated unit, integration, and end-to-end tests have not been added yet.
- The current signature verifier supports standard EVM account signatures; contract-wallet authentication requires an ERC-1271-aware verifier before production use.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for notable project changes.

## License

No open-source license is currently declared. All rights remain with Korum Labs, LLC unless a license file is added.
