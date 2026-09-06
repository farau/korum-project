# Changelog

All notable changes to Korum are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The project currently uses the version declared in `package.json` and has not published a tagged release.

## [Unreleased]

### Added

- Reown AppKit wallet connection with the Wagmi adapter, Robinhood Chain, and Robinhood Chain Testnet.
- SSR wallet-state hydration through Wagmi cookies and the root Next.js layout.
- Short-lived, server-signed wallet challenges with origin, network, nonce, and expiration validation.
- Server-side EVM signature verification through Viem.
- Signed 12-hour wallet sessions stored in `HttpOnly`, `SameSite=Strict`, production-secure cookies.
- Authenticated `/api/profile` example for future wallet-specific Railway data.
- Server-side profile authorization that withholds profile payloads from unauthenticated requests.
- Environment template for Reown metadata and session security configuration.
- Complete wallet-profile interface with Information, Activity, Referrals, Badges, Watchlist, and Global simulator tabs.
- Dedicated Explore empty state when mock data is disabled and no live versus are returned.
- Managed Railway PostgreSQL service and checksum-protected schema migration runner.
- Database-backed `users` table with UUID identities, unique normalized EVM wallets, wallet-derived referral codes, editable profile metadata, and login timestamps.
- Transactional database smoke test for wallet upsert and referral invariants.
- End-to-end authentication check with an automatically removed ephemeral wallet user.
- Authenticated profile bio updates with strict server-side validation.
- Complete responsive Korum application shell with shared header and footer.
- Canonical Explore page with animated grid lines, pointer halo, search, category filters, sorting, grid view, and table view.
- Interactive VS cards with token imagery, market data, sparklines, percentage meters, watchlist actions, and separate buy and sell states.
- Animated transaction feed with distinct green buy and red sell arrival states.
- Header-level mock data control with persisted browser state.
- Deterministic debate and token fixtures exposed through `/api/debates`.
- Detailed `Debate` and `DebateToken` TypeScript contracts for future Railway indexer integration.
- Dynamic `/vs/[id]` route for matchup details.
- Persistent browser watchlist and dedicated `/watchlist` page.
- Wallet-gated profile with the connected EVM address used as the referral code.
- Earn page with creator, trader, and referral explanations.
- Interactive creator and referral revenue calculator with tiered creator fees.
- Concept page covering matchup mechanics, Korum terminology, fee tiers, a worked revenue example, and referral distribution.
- Analytics page with trading metrics, category breakdowns, and top-market tables.
- Leaderboard with trader, creator, and referrer categories, period controls, sorting, search, podium, rank badges, and standout wins.
- Privacy Policy and Terms of Use pages.
- Dark and light themes with a persisted preference and animated view transition where supported.
- Project favicon, Korum footer branding, Robinhood Chain attribution, and reference media assets.
- Responsive behavior for desktop and mobile layouts.

### Changed

- Replaced the simulated development wallet with the Reown AppKit connection and signature flow.
- Moved the wallet provider to the root AppKit context so connection state persists across application routes.
- Bound profile identity and referral data to the address stored in the verified server session.
- Aligned the Profile page with the Korum reference design and translated its complete interface to English.
- Marked profile-image uploads and X account linking as unavailable with disabled, visually muted controls.
- Replaced hard-coded profile metrics with explicit Railway indexer placeholders.
- Persisted verified wallet users before issuing authenticated session cookies.
- Added the internal user UUID to the signed session and required it alongside the wallet for profile queries.
- Replaced the default Create Next App interface with the Korum product experience.
- Translated all application copy and canonical navigation labels to English.
- Renamed canonical routes to `/explore`, `/earn`, `/leaderboard`, `/concept`, `/create`, and `/profile`.
- Redirected `/` to `/explore`.
- Removed the former French route names and the former `/index` route.
- Renamed Explore components, context names, CSS selectors, and related assets to use English terminology.
- Replaced abbreviated mock/API fields with explicit English names, including `sideA`, `sideB`, `category`, `sideAPercentage`, `volume24h`, `participantCount`, `holderCount`, `marketCapA`, and `marketCapB`.
- Added nested token metadata for chain identity, addresses, prices, supply, market cap, liquidity, volume, holders, trades, images, creator addresses, and launch timestamps.
- Updated all cards, search logic, filters, analytics, watchlist, profile, ticker, detail pages, and leaderboard consumers to use the canonical data contract.
- Updated date and number presentation to English and UTC-oriented formats.
- Aligned the header, footer, Explore, Earn, Concept, Leaderboard, Privacy Policy, and Terms of Use visuals with the Korum reference document.
- Removed personal first-name and last-name fields from the wallet profile experience.

### Fixed

- Waited for Wagmi's active connector before requesting a signature, preventing `connector.getChainId` failures after hydration.
- Versioned Wagmi's persisted connection state and kept wallet disconnection available when application authentication fails.
- Kept the connected wallet address visible while authentication completes by refreshing Server Components without reloading AppKit.
- Prevented duplicate wallet users through a database unique constraint and atomic conflict handling.
- Prevented referral-code drift by deriving it from the immutable wallet column in PostgreSQL.
- Prevented theme initialization from producing a React hydration mismatch on the root HTML element.
- Corrected dynamic route parameter handling for the asynchronous Next.js 16 `params` API.
- Ensured filled token images have stable parent dimensions.
- Restored token images in VS cards with fallback references and image-error handling.
- Kept cards visible when switching from buy mode to sell mode.
- Corrected partial and accent-insensitive matchup search behavior.
- Limited Explore search to VS cards instead of transaction feed entries.
- Made category controls filter cards by each debate's declared category.
- Kept the search form above animated background streaks.
- Removed decorative white lines beside the Explore search field.
- Corrected light-theme coverage on the Explore page.
- Removed unwanted spacing between the shared header and page sections.
- Corrected profile access so content is shown only after wallet connection.
- Improved legal-page hero spacing, labels, backgrounds, and introductory text presentation.
- Corrected Concept fee, referral, worked-example, icon alignment, hover, and pointer-driven card effects.
- Improved Leaderboard crown spacing and iridescent colors.
- Added hover elevation and clearer borders to primary interactive controls.
- Made the favicon opaque and visible in browser tabs.

## [0.1.0] - 2026-08-31

### Added

- Initial project generated with Create Next App.

[Unreleased]: https://github.com/farau/korum-project/compare/131047a...HEAD
[0.1.0]: https://github.com/farau/korum-project/commit/131047a
