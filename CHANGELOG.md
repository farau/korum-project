# Changelog

All notable changes to Korum are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The project currently uses the version declared in `package.json` and has not published a tagged release.

## [Unreleased]

### Added

- Profile avatar upload, replacement, removal, and preview, with shared images in the header, Profile, leaderboard podium, and Versus creator panel.
- Bounded PostgreSQL avatar storage through migration `0010_create_user_avatars.sql`: JPEG/PNG/WebP uploads up to 5 MiB, server-side compression to 256 × 256 WebP up to 100 KiB, metadata stripping, decoded-image validation, and authenticated rate-limited updates.
- Confirmed on-chain referrer display in Profile, including the referrer's username when available and a copyable wallet address.
- Regression checks for image validation, two-wallet avatar isolation, notification ownership, and referral eligibility.

### Changed

- Kept Profile avatar actions stacked on the right with responsive sizing, and shortened the displayed account address while preserving full-address copying.
- Reduced Concept audience-pill borders and made the Three steps card titles bold.
- Revalidated pending referrals before creation and trading, rejecting self-referrals and replacement of existing referrers while allowing reciprocal referrals.

### Fixed

- Isolated notification history by wallet, discarded legacy ownerless history, and filtered late notifications from previously connected accounts.
- Reset Profile and avatar state when the wallet changes, required matching profile/session identities, and disabled avatar HTTP caching to prevent stale images.
- Scoped pending-referral state and responses to the active wallet so account changes cannot reuse another account's pending referral.

## [0.2.1] - 2026-09-20

### Changed

- Moved Explore search to a guarded Railway-backed API with a two-character minimum, 400 ms debounce, cancelled stale requests, 24-result hydration cap, 45-second Redis/shared HTTP caching, and a 30-requests-per-minute client-IP budget.
- Improved responsive behavior across Explore, the Filters button, notifications, and the mobile header.
- Made the VS button visible on mobile layouts.
- Translated the complete Versus card interface to English.
- Limited card navigation to the upper card area so trading controls remain interactive without unintended redirects.
- Calculated USD amounts from the ETH/USD rate supplied by the pipeline.
- Displayed creator usernames instead of wallet addresses where available.
- Refined the wallet modal visuals, including its spacing, controls, and responsive presentation.
- Replaced the connected-wallet address button with the shared hexagonal Profile avatar and a notification-styled responsive account panel for profile access and session-aware disconnection.
- Reworked the wallet-gated Profile state with clearer connect-versus-sign guidance, security assurances, a locked account preview, feature summaries, loading and error feedback, and a responsive mobile layout.

### Fixed

- Displayed market age in days in the Explore Table view after the first 24 hours.

## [0.2.0] - 2026-09-20

### Added

- Scroll-triggered reveal animations across Earn, Concept, and Analytics, with reduced-motion support.
- Count-up animations for the 70% creator share and 10% referral commission on Earn while keeping the fee range fixed.
- Reference-derived SVG artwork for Earn, Concept, Analytics, and Leaderboard cards and badges.
- Curve-aware chart periods with short bonding-curve windows and 5-minute through all-time graduated-pool ranges.
- RainbowKit wallet connection with Wagmi, Robinhood Chain, and Robinhood Chain Testnet.
- SSR wallet-state hydration through Wagmi cookies and the root Next.js layout.
- Short-lived, server-signed wallet challenges with origin, network, nonce, and expiration validation.
- Server-side EVM signature verification through Viem.
- Signed 12-hour wallet sessions stored in `HttpOnly`, `SameSite=Strict`, production-secure cookies.
- Authenticated `/api/profile` example for future wallet-specific Railway data.
- Server-side profile authorization that withholds profile payloads from unauthenticated requests.
- Environment template for WalletConnect and session security configuration.
- Complete wallet-profile interface with Information, Activity, Referrals, Badges, Watchlist, and Global simulator tabs.
- Dedicated Explore empty and unavailable states when no indexed Versus can be returned.
- Managed Railway PostgreSQL service and checksum-protected schema migration runner.
- Database-backed `users` table with UUID identities, unique normalized EVM wallets, unique short referral codes, editable profile metadata, and login timestamps.
- Transactional database smoke test for wallet upsert and referral invariants.
- Isolated PostgreSQL `indexer` read model for `ReferrerBound`, `VersusCreated`, and `CampCreated` events.
- Deployed Goldsky streaming pipeline for Robinhood Testnet with decode-once event processing and independent PostgreSQL projections for referrals, versus records, and camps.
- Transactional indexer smoke test covering referral bindings and complete two-camp versus projections.
- Global `?ref=ABC123` referral capture with database validation, URL sanitization, a temporary server-only cookie, and authenticated wallet resolution for future contract calls.
- End-to-end authentication check with an automatically removed ephemeral wallet user.
- End-to-end referral attribution checks covering capture, pending resolution, and self-referral rejection.
- Referral and indexer architecture decision documenting ownership boundaries, cookie lifecycle, later contract interactions, Goldsky projections, and rejected alternatives.
- Functional notification center in the header with persistent unread referral confirmations and watchlist add/remove updates.
- Versioned contract artifact structure for shared ABIs and chain-specific deployment addresses.
- Frontend-ready `VersusToken` ABI with standard ERC-20 reads, approvals, transfers, events, and token metadata URI.
- Authenticated profile bio updates with strict server-side validation.
- Authenticated editable usernames persisted with wallet profiles in Railway.
- Complete responsive Korum application shell with shared header and footer.
- Canonical Explore page with animated grid lines, pointer halo, search, category filters, sorting, grid view, and table view.
- Interactive VS cards with token imagery, market data, sparklines, percentage meters, watchlist actions, and separate buy and sell states.
- Animated transaction feed with distinct green buy and red sell arrival states.
- Detailed `Debate` and `DebateToken` TypeScript contracts for future Railway indexer integration.
- Dynamic `/vs/[id]` route for matchup details.
- Wallet-bound watchlist synchronized from Railway across cards, tables, details, profiles, tabs, and devices, with toggleable stars, add/remove notifications, and a dedicated `/watchlist` page.
- Wallet-gated profile with a unique six-character referral code associated with the connected EVM address.
- Earn page with creator, trader, and referral explanations.
- Interactive creator and referral revenue calculator with tiered creator fees.
- Concept page covering matchup mechanics, Korum terminology, fee tiers, a worked revenue example, and referral distribution.
- Analytics page with trading metrics, category breakdowns, and top-market tables.
- Leaderboard with real trader rankings, sorting, search, podium, and metrics-derived badges.
- Privacy Policy and Terms of Use pages.
- Dark and light themes with a persisted preference and animated view transition where supported.
- Project favicon, Korum footer branding, Robinhood Chain attribution, and reference media assets.
- Responsive behavior for desktop and mobile layouts.
- Contract-backed Versus creation page with live launch configuration and cost reads, token/camp setup, responsive preview, wallet network switching, transaction simulation, `createVersus` publication, receipt decoding, and referral finalization.
- Server-only Railway reader that joins indexed Versus records with both camps and maps complete projections to the frontend data contract.
- Live indexed Versus feed in Explore, including camp metadata, media, token addresses, creator information, and creation timestamps.
- Responsive Explore pagination with 12 indexed Versus per page across grid, table, search, filters, and sorting.
- Contract-backed trading panels on each Versus token with live ETH/token balances, on-chain buy and sell quotes, 1% minimum-output protection, wallet network switching, ERC-20 approval handling, receipt confirmation, and explorer links.
- Inline Explore trading controls shared with the Versus detail flow, opened directly in Buy or Sell mode and kept inside each card without navigation or overlays.
- Automatic trading-venue selection between the active `KorumCore` bonding curve and the graduated Uniswap pool through `KorumRouter`.
- Authenticated Railway-backed `user_watchlist` storage with protected read, add, and remove endpoints and transactional schema coverage.
- Goldsky trade and curve-lifecycle projections for both the pre-bonding `KorumCore` venue and post-bonding `KorumHook` venue, with Railway-backed chart and recent-trade APIs.
- Indexed current prices, 24-hour volumes, trader counts, market caps, adjusted FDVs, graduation progress, and selectable 1-hour through 180-day price histories across Explore and Versus detail pages.
- Server-only Alchemy ETH/USD quotes with a short cache and an explicit ETH fallback when no quote is available.
- Explicit `testnet`/`mainnet` network selection shared by wallet configuration, contract artifacts, Railway reads, explorer links, and watchlists.
- Official Robinhood RPC transport with a server-only, read-method-restricted Alchemy fallback endpoint that keeps API credentials out of browser bundles.
- Private Railway Redis service and a server-only, network-scoped cache shared by web replicas for ETH/USD quotes, Explore projections, Versus details, market charts, and recent trades.
- Redis-backed JSON-RPC rate limiting shared across replicas, with hashed client identifiers, batch-aware accounting, response budget headers, and an in-process fallback when Redis is unavailable.
- Visibility-aware reactive refreshes for Explore, Analytics, Versus details, charts, and the open Activity tab through shared TanStack Query keys and Redis-backed endpoints.
- A cache-backed `/api/debates/[id]` endpoint for refreshing one Versus without reloading the page or querying the blockchain.
- A global Redis-backed recent-trade endpoint and Railway timeline index for the live Explore buy/sell ticker.
- A bounded client-side ticker queue that reveals polled trades sequentially instead of rendering each polling batch simultaneously.
- `X-Korum-Cache` and `X-Korum-Cache-Layer` response headers on public Versus and market APIs for Redis hit, miss, bypass, and in-process deduplication diagnostics.
- Interactive TradingView Lightweight Charts rendering for price and market-cap OHLC candles, with fixed-width bars, real trade-time positioning, USD/ETH display switching, zoom, pan, crosshair values, and theme synchronization.
- Strict 1-hour through 180-day chart windows with range-specific candle intervals, an explicit no-trades state, and circulating-supply market caps adjusted for the post-graduation token residual.
- Authenticated Profile aggregates for on-chain referral count, Versus created and joined, indexed trade count, and total gross traded volume with USD conversion and an ETH fallback.
- A wallet-oriented PostgreSQL index for efficient Profile trade aggregates over the Goldsky read model.
- Paginated Profile Activity history loaded 10 wallet-attributed trades at a time, including camp, side, venue, token amount, ETH paid or received, fees, UTC time, and explorer links.
- Estimated all-time Profile PNL calculated from net indexed cash flows plus full-position liquidation values matching the bonding curve, with per-Versus win/loss counts.
- A private 20-second Redis cache for wallet-scoped Profile statistics and PNL, using hashed wallet cache keys and retaining `private, no-store` HTTP responses.
- A server-paginated all-time trader leaderboard built from indexed volume and executable PNL estimates, with Railway usernames, wallet search, sorting, and five-minute Redis/shared HTTP caching restricted to reusable unfiltered pages.
- Trigger-maintained `indexer.trader_totals` and `indexer.trader_positions` tables, transaction-safe historical backfill, and replay-safe INSERT/UPDATE/DELETE aggregation.
- Shared seven-tier badge calculation for Profile and Leaderboard, selecting each wallet's highest qualifying Creator, Trader, or Referrer path from Railway metrics instead of leaderboard position.

### Changed

- Rebuilt Explore Versus cards to match the reference proportions, localized controls, quick-amount trading flow, full-card navigation, and hover-only white animated border.
- Restyled Explore category filters as transparent liquid-glass controls with theme-aware selected states and stronger gradient borders.
- Extended the Explore grid behind the first card row, reduced animated-line density, aligned streaks to grid lines, and harmonized search, filter, ticker, and card surfaces in both themes.
- Realigned page containers and the Explore filter banner, enlarged the shared header and footer controls, tightened navigation spacing, and restored the reference moon icon in dark mode.
- Refined Earn cards, icons, hover elevation, calculator proportions, result borders, illustration alignment, and light-theme surfaces without replacing their original backgrounds.
- Restored Concept step artwork, hover behavior, centered hero spacing, glass controls, gradient borders, reference icons, and stronger light-theme card contrast.
- Restyled every Analytics panel with stronger glass borders and contrast, aligned its hero spacing with Earn and Concept, and expanded medium-width cards.
- Updated Versus details with market-preference copy, indexed creator status and badge tiers, simplified metadata, and chart controls based on the active trading venue.
- Prevented duplicate Versus publication attempts, exposed transaction-preparation feedback, and redirected successful creation directly to the new Versus page.
- Enlarged and repositioned the Leaderboard podium, restored its transparent theme-specific reference artwork, shortened wallet labels consistently, and enhanced the iridescent crown animation.
- Copied profile referral values as complete shareable links using the current application origin and the `?ref=` query parameter.
- Replaced EVM-address referral codes with random six-character Base62 codes generated securely, stored, and uniquely bound to wallets.
- Moved referrer relationships out of `users`; `ReferralRegistry` is authoritative and Goldsky provides the queryable PostgreSQL projection.
- Replaced the simulated development wallet with the RainbowKit connection and signature flow.
- Moved the wallet provider to the root RainbowKit context so connection state persists across application routes.
- Bound profile identity and referral data to the address stored in the verified server session.
- Aligned the Profile page with the Korum reference design and translated its complete interface to English.
- Marked profile-image uploads and X account linking as unavailable with disabled, visually muted controls.
- Replaced hard-coded profile metrics with Railway-indexed wallet aggregates and an explicitly qualified mark-to-market PNL, while retaining a placeholder only for total wallet valuation.
- Replaced spot-price multiplication in Profile PNL with a local reconstruction of `KorumCore.quoteSell`, using indexed reserves and the on-chain launch configuration so price impact and current sell fees are included without sending wallet position sizes to an RPC provider.
- Replaced the former synthetic leaderboard with Goldsky/Railway trader rankings and removed misleading partial-period PNL controls.
- Replaced full trade-history scans for Profile and leaderboard PNL with incrementally maintained trader aggregates.
- Persisted verified wallet users before issuing authenticated session cookies.
- Added the internal user UUID to the signed session and required it alongside the wallet for profile queries.
- Replaced the default Create Next App interface with the Korum product experience.
- Translated all application copy and canonical navigation labels to English.
- Renamed canonical routes to `/explore`, `/earn`, `/leaderboard`, `/concept`, `/create`, and `/profile`.
- Redirected `/` to `/explore`.
- Removed the former French route names and the former `/index` route.
- Renamed Explore components, context names, CSS selectors, and related assets to use English terminology.
- Replaced abbreviated data fields with explicit English names, including `sideA`, `sideB`, `category`, `sideAPercentage`, `volume24h`, `participantCount`, `holderCount`, `marketCapA`, and `marketCapB`.
- Added nested token metadata for chain identity, addresses, prices, supply, market cap, liquidity, volume, holders, trades, images, creator addresses, and launch timestamps.
- Updated all cards, search logic, filters, analytics, watchlist, profile, ticker, detail pages, and leaderboard consumers to use the canonical data contract.
- Updated date and number presentation to English and UTC-oriented formats.
- Aligned the header, footer, Explore, Earn, Concept, Leaderboard, Privacy Policy, and Terms of Use visuals with the Korum reference document.
- Removed personal first-name and last-name fields from the wallet profile experience.
- Translated the complete Versus creation interface to English and consolidated its page-specific styles into globally loaded, `create-`-prefixed selectors.
- Made Railway-indexed Versus data the exclusive source across Explore, matchup details, Watchlist, and Analytics.
- Replaced neutral market placeholders with metrics calculated from indexed `Trade` events and exact curve/graduation state.
- Centralized the deployed router, hook, and Versus token contract artifacts in the shared frontend contract adapter.
- Added short public HTTP cache and stale-while-revalidate policies matching the Redis TTLs for indexed debate, chart, and trade endpoints.

### Fixed

- Kept the Leaderboard podium visible independently of the number of indexed traders while positioning available entries explicitly as second, first, and third.
- Corrected Analytics mobile and tablet layouts so cards use the available width and Weekly and Annual charts no longer overlap.
- Removed the stray Analytics hero divider and ensured period-selector indicator dots remain visible above button borders.
- Limited Explore trade-row red and green arrival backgrounds to their one-second entrance animation in both themes.
- Corrected Concept step-image sizing and vertical alignment, Earn calculator illustration alignment, and shared light-theme card borders.
- Opened RainbowKit's account modal from the connected address button and hid the Profile shortcut while disconnected.
- Opened the RainbowKit signature prompt immediately after connecting a wallet without a matching authenticated session.
- Restricted Explore background grids to the hero in both themes and kept Leaderboard grid-free.
- Restored the original Glass Green / Glass Red button surfaces and gradient borders, including visible borders on solid controls.
- Rebuilt the Explore table with paired token rows, per-token metrics, sparklines, timeframe changes, detail links, and watchlist controls.
- Restored the rainbow crown and the dedicated light-theme podium PNG from the design reference.
- Matched Analytics metric glyphs, outlined period selection, volume icons, category percentage labels, and dark chart bars in light mode.
- Improved Analytics chart responsiveness and light-theme Concept icon contrast, rings, and card gradients.
- Rounded the profile avatar hexagon and standardized positive text colors with a darker green in light mode.
- Reconstructed public request origins from Railway proxy headers so wallet challenges retain valid same-origin protection and use the correct HTTPS signing domain.
- Waited for Wagmi's active connector before requesting a signature, preventing `connector.getChainId` failures after hydration.
- Versioned Wagmi's persisted connection state and kept wallet disconnection available when application authentication fails.
- Kept the connected wallet address visible while authentication completes by refreshing Server Components without reloading RainbowKit.
- Prevented duplicate wallet users through a database unique constraint and atomic conflict handling.
- Prevented referral-code drift by preserving the initially assigned compact code on every wallet upsert.
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
- Converted decoded Solidity `uint128` and `uint256` event parameters to Goldsky `U256` values before PostgreSQL writes, unblocking exact `NUMERIC` inserts for versus IDs and camp launch values.
- Kept Wagmi's cookie-restored account state hidden until browser mount, preventing wallet controls and trading panels from producing hydration mismatches.
- Resolved watchlist entries exclusively against their Railway-indexed Versus and camp rows.
- Excluded the exact `Graduated.tokenResidual` locked supply from post-graduation market-cap and adjusted-FDV calculations instead of treating 100% of token supply as circulating.
- Removed the implicit `NODE_ENV` chain switch so a production build cannot silently select mainnet while still using testnet contract addresses and indexer rows.
- Corrected Explore trader totals to use distinct indexed trade wallets instead of the unavailable holder-count placeholder, including per-camp counts in table view.
- Kept pre-bonding market cap tied to tokens actually released from the curve, while exposing the broader protocol-adjusted valuation only as Adjusted FDV.
- Replaced the Analytics trade-count estimate with the indexed 24-hour trade totals and invalidated active market queries after confirmed transactions.
- Read the Profile PNL launch configuration from `indexer.versuses`, fixing the runtime query against `camp_market_state`, which does not expose `config_id`.
- Made aggregate subtraction constraint-safe so Goldsky replay updates and trade deletions keep trader totals and positions synchronized.
- Removed the development-only generated market feed and its UI switch; Explore, Analytics, the activity ticker, Watchlist, and Versus details now resolve exclusively from Goldsky/Railway.

## [0.1.0] - 2026-08-31

### Added

- Initial project generated with Create Next App.

[Unreleased]: https://github.com/farau/korum-project/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/farau/korum-project/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/farau/korum-project/compare/0.1.0...v0.2.0
[0.1.0]: https://github.com/farau/korum-project/commit/131047a
