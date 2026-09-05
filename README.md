# Korum

Korum is a Next.js application for creating and exploring tokenized matchups. Each matchup contains two opposing tokens. Users can follow market activity, compare both sides, simulate potential earnings, maintain a watchlist, and access wallet-linked profile data.

The current repository is a functional frontend prototype. It uses deterministic mock market data and a temporary local wallet adapter while the Railway indexer, database, smart-contract interactions, and production wallet connection are being prepared.

## Current Status

- The interface and all canonical routes are in English.
- The Explore experience, filters, search, cards, ticker, analytics, leaderboard, earnings calculator, watchlist, profile gate, and legal pages are implemented.
- Mock debates are available through the same typed data contract intended for the future API.
- Wallet connection is simulated locally and does not currently request a real wallet signature.
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
- Persistent local watchlist.
- Wallet-gated profile using the connected EVM address as the referral code.
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

## Requirements

- Node.js 20.9.0 or newer
- npm
- Network access during a clean production build so `next/font` can retrieve Geist

No environment variables are currently required.

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
| `npx tsc --noEmit` | Run a standalone TypeScript check |
| `npx next typegen` | Regenerate typed App Router route definitions |

## Routes

| Route | Description |
| --- | --- |
| `/` | Redirects to `/explore` |
| `/explore` | Main discovery feed, search, filters, ticker, and VS cards |
| `/vs/[id]` | Detail page for a specific matchup |
| `/earn` | Earning paths and interactive revenue calculator |
| `/leaderboard` | Trader, creator, and referrer rankings |
| `/concept` | Product mechanics, terminology, fees, and referrals |
| `/analytics` | Protocol and market analytics |
| `/create` | VS creation prototype |
| `/watchlist` | Locally saved matchups |
| `/profile` | Wallet-gated profile and referral address |
| `/privacy` | Privacy Policy |
| `/terms` | Terms of Use |
| `/api/debates` | Current JSON endpoint for the debate data contract |

Legacy French routes and the former `/index` route are intentionally not maintained. Internal links use the canonical English routes.

## Project Structure

```text
app/
├── api/debates/            # Debate JSON route
├── components/             # Shared client and server components
│   ├── analytics/          # Analytics UI and data composition
│   └── explore/            # Search, filters, ticker, cards, and feed
├── hooks/                  # Browser-state hooks such as the watchlist
├── lib/                    # Typed debate model and mock data generator
├── vs/[id]/                # Dynamic matchup route
├── */page.tsx              # App Router pages
├── globals.css             # Shared design system and responsive styles
└── layout.tsx              # Metadata, fonts, theme initialization
public/
└── korum-reference/        # Visual assets adapted from the reference design
```

`PageWrapper` mounts the shared header, footer, mock provider, and wallet provider around each application page.

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
- Disabled: the Explore cards and ticker are hidden, making an empty future-API state easy to test.
- `/api/debates` currently returns the same deterministic fixtures.
- Analytics and watchlist can request `/api/debates`; this endpoint is the intended replacement point for Railway data.

Mock timestamps use a fixed UTC reference date so server and client output remains deterministic during hydration.

## Wallet Prototype

`WalletProvider` currently simulates a connected wallet using a development EVM address. State is stored under `korum-wallet-address`.

- The header button connects or disconnects the development address.
- `/profile` remains locked until an address is connected.
- The profile uses only the wallet address, without first or last names.
- The complete EVM address is the referral code.

Before production, replace this provider with the selected wallet SDK while preserving the existing `address`, `connected`, `hydrated`, `connect`, and `disconnect` interface where practical.

## Browser Persistence

| Key | Value |
| --- | --- |
| `korum-theme` | `dark` or `light` |
| `korum-mock` | Mock feed preference |
| `korum-wallet-address` | Temporary connected EVM address |
| `korum-watchlist` | JSON array of saved debate IDs |

All reads that affect initial rendering are deferred until client hydration to avoid server/client markup mismatches.

## Styling and Assets

The visual system is primarily defined in `app/globals.css`. Theme values use CSS custom properties selected through the `data-theme` attribute on the root HTML element.

Reference media is stored in `public/korum-reference`. Remote mock token images currently use `https://picsum.photos`, allowed through `next.config.ts`. Production image domains must be added to `images.remotePatterns` before optimized remote images are introduced.

## Railway Integration

The recommended integration path is:

1. Keep the `Debate` and `DebateToken` interfaces as the frontend contract.
2. Add a server-only Railway client or service module.
3. Fetch indexer records inside `/api/debates` or dedicated server components.
4. Convert database timestamps to ISO 8601 UTC strings and millisecond timestamps at the boundary.
5. Validate and normalize nullable database fields before returning JSON.
6. Replace the fixed `getDebates()` response without changing card or analytics components.
7. Add loading, empty, and API-error states for every data-driven page.
8. Keep secrets server-side and expose only explicitly public `NEXT_PUBLIC_*` values to client components.

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

- Wallet connection is simulated and does not use a production wallet SDK yet.
- Creation, buy, and sell actions do not submit transactions.
- `/api/debates` serves in-memory mock data rather than Railway records.
- Leaderboard rows and analytics projections are deterministic prototype values.
- Watchlist state is local to one browser and is not wallet-synced.
- Advanced numeric filters and quick-amount configuration are visual placeholders.
- Automated unit, integration, and end-to-end tests have not been added yet.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for notable project changes.

## License

No open-source license is currently declared. All rights remain with Korum Labs, LLC unless a license file is added.
