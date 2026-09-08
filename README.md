# Korum

Korum is a Next.js application for creating and exploring tokenized matchups. Each matchup contains two opposing tokens. Users can follow market activity, compare both sides, simulate potential earnings, maintain a watchlist, and access wallet-linked profile data.

The current repository is a functional frontend prototype. It uses deterministic mock market data while the Railway indexer, database, and smart-contract interactions are being prepared. Wallet connection is provided by RainbowKit and authenticated through a server-verified wallet signature.

## Current Status

- The interface and all canonical routes are in English.
- The Explore experience, filters, search, cards, ticker, analytics, leaderboard, earnings calculator, watchlist, wallet profile, and legal pages are implemented.
- Mock debates are available through the same typed data contract intended for the future API.
- Wallet connection uses RainbowKit on Robinhood Chain and Robinhood Chain Testnet.
- Profile access requires a valid server-side session created from a verified wallet signature.
- Wallet identities and editable profile fields are persisted in a managed Railway PostgreSQL database.
- Trading and VS creation controls are UI prototypes; they do not submit blockchain transactions yet.

## Main Features

- Responsive dark and light themes with a persisted preference.
- Animated background grid, moving light streaks, and a subtle pointer halo.
- Search across matchup names, token names, symbols, and categories.
- Category filters and sorting by trend, market cap, volume, traders, or launch date.
- Grid and table views for matchup discovery.
- Buy and sell card states for both matchup tokens.
- Live-style transaction ticker with green buy and red sell highlights.
- Mock data switch for testing the Explore feed without a backend.
- Dedicated empty state when mock data is disabled and the live source returns no versus.
- Persistent local watchlist.
- Wallet-gated profile with information, activity, referral, badge, watchlist, and simulation tabs.
- Connected EVM address used as both the profile identity and referral code.
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
| Persistence | Browser `localStorage` for prototype state |
| Wallet | RainbowKit with Wagmi |
| Authentication | Viem signature verification and signed server sessions |
| Database | Managed PostgreSQL on Railway through the `postgres` driver |

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
| `NEXT_PUBLIC_APP_URL` | Public | Exact public application origin used in sign-in messages |
| `KORUM_SESSION_SECRET` | Server only | HMAC secret containing at least 32 random bytes |
| `DATABASE_URL` | Server only | PostgreSQL connection URL supplied by Railway |

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
| `npm run auth:check` | Exercise wallet authentication and profile persistence with a disposable test account |
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
| `/create` | VS creation prototype |
| `/watchlist` | Locally saved matchups |
| `/profile` | Wallet-gated account information, activity, referrals, badges, watchlist, and simulator |
| `/privacy` | Privacy Policy |
| `/terms` | Terms of Use |
| `/api/debates` | Current JSON endpoint for the debate data contract |
| `/api/auth/challenge` | Creates a short-lived wallet sign-in challenge |
| `/api/auth/verify` | Verifies the wallet signature and creates a session |
| `/api/auth/session` | Reads or deletes the current wallet session |
| `/api/profile` | Example authenticated profile endpoint |

Legacy French routes and the former `/index` route are intentionally not maintained. Internal links use the canonical English routes.

## Project Structure

```text
app/
├── api/                    # Public debate and authenticated wallet routes
├── components/             # Shared client and server components
│   ├── analytics/          # Analytics UI and data composition
│   └── explore/            # Search, filters, ticker, cards, and feed
├── hooks/                  # Browser-state hooks such as the watchlist
├── lib/                    # Typed data model, fixtures, and server auth
├── vs/[id]/                # Dynamic matchup route
├── */page.tsx              # App Router pages
├── globals.css             # Shared design system and responsive styles
└── layout.tsx              # Metadata, fonts, theme initialization
public/
└── korum-reference/        # Visual assets adapted from the reference design
```

The root layout mounts the SSR-aware RainbowKit and wallet providers. `PageWrapper` supplies the shared header, footer, and mock-data provider to application pages.

## Data Contract

The canonical mock and future API types live in `app/lib/debates.ts`. `getDebates()` enriches a compact deterministic fixture with token metadata, market metrics, image references, creator data, and UTC timestamps.

Core `Debate` fields include:

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | `number` | Stable matchup identifier |
| `sideA`, `sideB` | `string` | Fallback display names for both sides |
| `category` | `string` | Filtering category |
| `sideAPercentage` | `number?` | Side A share; Side B is the remainder |
| `volume24h` | `number` | Combined 24-hour volume |
| `participantCount` | `number` | Number of participating traders |
| `holderCount` | `number?` | Combined holder count |
| `marketCapA`, `marketCapB` | `number?` | Side-level market capitalization |
| `tokenA`, `tokenB` | `DebateToken?` | Detailed token records |
| `createdAtUtc`, `launchedAtUtc` | `string?` | ISO 8601 UTC dates |
| `createdAtTimestamp`, `launchTimestamp` | `number?` | Unix timestamps in milliseconds |
| `imageRefA`, `imageRefB` | `string?` | API-ready image references |
| `creatorAddress` | `string?` | Creator EVM address |

Each `DebateToken` can provide identity, chain, pricing, supply, liquidity, holder, trade, launch, image, and creator fields. Components prefer nested token values and use matchup-level values where appropriate.

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
    "chainId": 8453,
    "marketCap": 117744
  }
}
```

Treat this type as the frontend boundary when replacing the fixture with Railway data. Avoid adding temporary aliases for old field names; transform indexer responses at the API boundary instead.

## Mock Data

The `Mock data` switch is available in the header and persists its value under `korum-mock`.

- Enabled: the Explore cards and animated activity ticker use `getDebates()`.
- Disabled: the mock cards and ticker are hidden. If the live source returns no records, Explore displays a dedicated `No versus available yet` state.
- `/api/debates` currently returns the same deterministic fixtures.
- Analytics and watchlist can request `/api/debates`; this endpoint is the intended replacement point for Railway data.

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

`/profile` reads the session on the server and does not send profile data to unauthenticated clients. `/api/profile` demonstrates the same protection for a Route Handler. Every future wallet-specific Railway query must repeat this server-side authorization check; hiding content in React is not a security boundary.

The current profile mirrors the Korum reference layout while keeping its controls reactive. Its Information, Activity, Referrals, Badges, Watchlist, and Global simulator tabs are client-side React views. Wallet-specific metrics display `Awaiting indexer` until Railway supplies authoritative records. Profile-image uploads and X account linking are visibly disabled and cannot be activated by pointer or keyboard.

## User Database

The first migration lives in `db/migrations/0001_create_users.sql`. The `users` table stores:

- A generated UUID primary key.
- A lowercase, format-checked, unique EVM wallet.
- A generated and unique referral code that is always identical to the EVM wallet.
- An optional self-referencing referrer relationship.
- A 160-character profile bio.
- Future avatar object metadata and verified X account metadata.
- Last-login chain and timestamps, plus creation and update timestamps.

Wallet addresses and referral codes are immutable through the Profile API. `POST /api/auth/verify` performs an atomic `INSERT ... ON CONFLICT DO UPDATE`, so concurrent sign-ins for the same wallet resolve to one user record. `GET` and `PATCH /api/profile` derive identity only from the signed session. Profile updates use a strict field allowlist; currently only `bio` can be changed.

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
| `korum-watchlist` | JSON array of saved debate IDs |

All reads that affect initial rendering are deferred until client hydration to avoid server/client markup mismatches.

Wagmi and the authenticated session additionally use cookies. The signed session cookie is intentionally unavailable through browser JavaScript.

## Styling and Assets

The visual system is primarily defined in `app/globals.css`. Theme values use CSS custom properties selected through the `data-theme` attribute on the root HTML element.

Reference media is stored in `public/korum-reference`. Remote mock token images currently use `https://picsum.photos`, allowed through `next.config.ts`. Production image domains must be added to `images.remotePatterns` before optimized remote images are introduced.

## Railway Integration

The recommended integration path is:

1. Keep the `Debate` and `DebateToken` interfaces as the frontend contract.
2. Reuse the existing server-only database boundary in `app/lib/db`.
3. Fetch indexer records inside `/api/debates` or dedicated server components.
4. Convert database timestamps to ISO 8601 UTC strings and millisecond timestamps at the boundary.
5. Validate and normalize nullable database fields before returning JSON.
6. Replace the fixed `getDebates()` response without changing card or analytics components.
7. Add loading, empty, and API-error states for every data-driven page.
8. Keep secrets server-side and expose only explicitly public `NEXT_PUBLIC_*` values to client components.
9. Call `getWalletSession()` before every wallet-specific query and use `session.address`, never an address supplied by the browser.

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

- Creation, buy, and sell actions do not submit transactions.
- `/api/debates` serves in-memory mock data rather than Railway records.
- Leaderboard rows and analytics projections are deterministic prototype values.
- Watchlist state is local to one browser and is not wallet-synced.
- Profile metrics remain empty until the Railway indexer is connected.
- Profile-image uploads and X account linking are intentionally disabled.
- Advanced numeric filters and quick-amount configuration are visual placeholders.
- Automated unit, integration, and end-to-end tests have not been added yet.
- The current signature verifier supports standard EVM account signatures; contract-wallet authentication requires an ERC-1271-aware verifier before production use.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for notable project changes.

## License

No open-source license is currently declared. All rights remain with Korum Labs, LLC unless a license file is added.
