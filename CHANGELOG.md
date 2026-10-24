# Changelog

All notable changes to Korum are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The project version is declared in `package.json`.

## [Unreleased]

### Changed

- Complete final local verification on 2026-10-25: all 30 checks, lint and production build pass. The refreshed npm audit now reports 17 high-severity package entries (including production), all tracing to Zod advisory GHSA-mrhx-c7xc-m3w5; the earlier clean audit is historical. Dependencies remain unchanged pending a compatible wallet-SDK remediation.
- Align frontend, referral/indexer, live-cache and token-image architecture docs with route groups, targeted Profile SSE, global rankings, compact snapshots, durable nonce consumption and upload reservations. Document deployment and real-wallet validation still pending.
- Strengthen Header and Profile Connect Wallet borders to 2px in dark mode, with a white upper edge and grey sides/bottom.

- Compute Analytics categories over the complete selected period and load its top markets from the global ranking; share period requests and display the actual snapshot timestamp.
- Share one 30-second Redis Leaderboard projection across searches, pages and sorts, preserving global ranks and batching creator/referral aggregates.
- Target authenticated Profile SSE updates to personal changes and held-token prices, with conservative reset recovery and no new per-user SQL polling. Keep internal actor hashes out of public events.
- Statically render Concept, Earn, Privacy and Terms with lightweight providers; defer wallet SDK loading until connection intent or returning-wallet restoration. Preserve page state and raw Wagmi cookies when entering interactive routes.
- Share the cards' minute clock and pending-referral queries; remove five unused files and twelve duplicate CSS rules. Retain x402 dependencies required by Coinbase's SDK.
- Add 22 isolated checks, eight local SQL/Redis integration checks and a GitHub Actions workflow for lint, regression tests and production build. Final local browser checks cover public wallet activation, Analytics and Explore at desktop/mobile widths; production rollout remains pending.

- Rank and paginate Explore across all indexed Versus on the server, returning 12 compact items per page. Share the ranking projection across filters/users, slide quiet-market volume windows in memory, and update only affected ranking rows on live publication. Keep the legacy `/api/versus` list response for existing consumers.
- Scope token trade/history/venue request caches to token and metadata revisions, so an unrelated trade no longer invalidates them.
- Coalesce live list/ticker refreshes over one second and Profile statistics over five seconds; target detail refreshes to affected tokens, retain immediate chart merges and let slow list responses finish.
- Update Next.js and its ESLint configuration to 16.4.2, Sharp to 0.35.5 and the Axios override to 1.20.0; refresh compatible vulnerable transitive dependencies. The full npm audit reported zero vulnerabilities on 2026-10-23; the 2026-10-25 Zod findings above supersede that result.
- Share watchlist membership through one wallet-scoped provider and an IDs-only API response. Load full debate data only in Watchlist views, with one cross-tab listener per wallet session.
- Reuse a warm catalog for single-market reads without building the full catalog on a cold detail visit; retain catalog batching for multi-market consumers.
- Serve cropped 1x/2x mobile Explore artwork for both themes, preserving the desktop assets. Generate derivatives with `scripts/optimize-explore-backgrounds.mjs`.
- Replace raw 24-hour trade arrays with compact timestamp buckets and cumulative totals; preserve exact rolling windows and sample sparklines at 96 quarter-hour closes across 24 hours. Carry known prices through inactive intervals, retain null slots before creation/first known price, and show an empty state when no price is known; no raw-trade tail query is needed. Count traders from incrementally maintained wallet/token memberships. Migration `0016_create_market_snapshot_aggregates.sql` backfills these projections and maintains inserts, corrections and deletes transactionally; apply it before deploying the reader. Replace the redundant time index with a covering index and version the internal Redis snapshots. Event-driven invalidation, idle retention and Profile polling behavior are unchanged.

### Fixed

- Avoid closing an already-cancelled SSE controller; handle malformed wallet cookies and defer requested wallet-modal opening until provider initialization completes.

- Keep Explore's open filter menu above the footer when filtered results are empty or short.
- Recover maintained-cache read, lease and write failures with shared fresh SQL reads per process; preserve SQL errors and avoid reloading successful reads when only cache persistence or lease cleanup fails. Coalesce degraded Profile and selected-page reads.
- Bound market-detail SQL work to selected Versus before expanding market/recipient views; hydrate a cold Explore page in one batch without loading the 250-market catalog. Defer Explore database work until an incoming request during Next.js builds.
- Release PostgreSQL connections before uploading token images to Pinata. Use short, owner-fenced upload reservations and share identical in-flight uploads; return a retryable response for another replica's active reservation. Requires migration `0018_create_token_image_upload_leases.sql`.
- Recover missed Goldsky trade deliveries through a transactional insert/update/delete journal. The existing shared minute probe checks pending deliveries, invalidates affected charts and maintained sources only when needed, and preserves concurrent changes. One timer per SSE server process shares the same cross-replica lease; no periodic SQL reload per user. Requires migration `0019_create_market_delivery_outbox.sql`. Migrations 0018 and 0019 were applied and verified on the configured Railway testnet database on 2026-10-22; application changes remain undeployed.
- Keep Profile holdings in a wallet-scoped query across tab changes, with polling limited to the Holdings panel and request/response wallet checks.
- Preserve Explore pagination across live ranking changes and clamp the selected page when results shrink.
- Reject reused wallet sign-in challenges with transactional nonce consumption (requires migration 0017); bound verification payloads and attempts while retaining contract-wallet signature verification.
- Rate-limit Leaderboard searches and cache repeated search pages for 30 seconds without changing global ranks.
- Coalesce concurrent SQL fallbacks when Redis revision reads fail, without storing unversioned data.
- Reuse the launch-preview quote when both initial token amounts match.
- Isolate watchlist reads, optimistic mutations and rollbacks between wallet sessions; serialize rapid mutations, reject requests whose expected wallet differs from the session cookie, and preserve cached membership with a visible error when refresh fails.
- Skip session deletion and server refresh for anonymous visitors without a session cookie, while still clearing restored cookies after wallet disconnection.
- Apply the saved theme while parsing the initial HTML so light-theme visits do not first download the dark Explore background.
- Repair outdated Analytics, creator-fee and graduated-market test fixtures; add watchlist concurrency and anonymous-session regression checks. Retain isolated Redis coverage for event-driven invalidation and shared cache reconstruction.

## [0.3.2] - 2026-10-21

### Changed

- Replace the six light-theme illustrations in Earn and Concept with the supplied WebP assets, remove the superseded PNG files, and adapt Concept's image sizing to the new canvases.
- Align Profile's avatar with the username on mobile and present the membership date as a compact line below the badges.
- Reuse Explore's horizontal scrolling controls for Profile tabs, with touch-sized buttons and a scroll arrow when tabs overflow.
- Share the same referral URL field and copy control between Profile Overview and Referrals. Size the field to its URL in Referrals and constrain it to the Overview card, with smaller text, a separate illustration area, and copy success/failure feedback. Simplify the sharing instruction to “Share your referral link.”
- Give Profile card illustrations a fixed display scale across card sizes and themes.
- Reuse Explore's market-cap and holder icons below Versus charts, use the shared Analytics volume glyph, and shorten contract-address buttons to “CA” with a copy icon on mobile.
- Reduce the border around Analytics' trading icon from 2 px to 1 px.
- Update Explore cards to emphasize the leading token through the artwork split and animated market-share bar, respecting reduced-motion preferences.

### Removed

- Remove Profile's Global simulator tab, panel, unused styles and icon, and update the profile documentation while retaining Earn's earnings simulator.
- Remove the description from Versus detail pages and delete its unused presentation styles.

### Fixed

- Group the footer marquee into two repeated sequences for continuous scrolling and restore Explore's footer separator.

## [0.3.1] - 2026-10-15

### Added

- Regression checks for migrated-token PNL, mixed and unpriced positions, consistency with Holdings, cross-replica wallet-cache reuse, targeted invalidation/correction recovery, and live Profile refresh coalescing, reconnect recovery and wallet isolation.

### Changed

- Replace Profile's fixed 20-second SQL statistics cache with maintained private wallet counters/positions and shared market valuation data. Renew ten-minute idle retention on reads, coalesce cold loads across replicas, invalidate only affected trader/creator/referrer sources after trades, recover indexed corrections and reuse the same sources for Holdings; retain bounded fallbacks without live Redis.
- Clarify Profile's PNL valuation in Overview and Activity: remaining pool tokens use current prices excluding selling fees and price impact, so actual sale proceeds may be lower.

### Fixed

- Include migrated tokens in Profile's estimated PNL using the same indexed pool spot valuation as Holdings, alongside curve sale values after protocol fees and recorded trade cash flows. Disclose omitted pool selling fees/price impact and keep the total unavailable when an open position cannot be valued; version shared market snapshots and Holdings caches for the updated valuation data.
- Refresh Profile's displayed PNL and counters through the existing shared trade-notification stream and an authenticated statistics-only endpoint while the authenticated Profile is mounted and visible. Coalesce notifications over one second, reconcile on reconnect/window focus, and use a one-minute foreground fallback when live delivery is unavailable without reloading profile identity or referrer data.

## [0.3.0] - 2026-10-15

### Added

- Global navbar search for Versus names, token names/symbols and contract addresses, with debounced results, keyboard navigation, mobile search and links to Versus detail pages.
- Indexed calendar-year analytics with monthly volume bars, recorded annual trades, traders, active Versus and total/creator fees, USD values with an ETH fallback, and month/year-aware cache keys and refresh behavior.
- Interactive volume-chart tooltips with exact amounts, pointer/touch interaction and keyboard focus support.
- Permissionless migration completion from Versus trading panels: recheck contract status, switch networks, estimate and simulate graduation with a gas reserve, request wallet confirmation and monitor replacements or pending receipts before refreshing the market.
- Regression checks for shared market-cache concurrency, rolling price windows, private watchlist invalidation, annual analytics and graduation controls, plus SELECT-only indexer diagnostics.

### Changed

- Refresh Explore and Profile with dark/light artwork, compact page layouts, shared icons, themed card surfaces and updated typography; move Profile's membership date into the hero and rename its information tab to Overview.
- Restyle Explore Versus cards with split token artwork, stronger image gradients, market-share bars, per-token MCAP and holder values, compact spacing and a View versus action; expose indexed per-token holder counts alongside combined Versus holders.
- Move Explore search into the global navbar, remove the former search provider and page-local search interface, and retain category filtering through a dedicated provider.
- Add responsive horizontal scrolling controls to Explore categories and the live trade ticker.
- Keep the navbar transparent over Explore's background at the top of the page, then apply the shared opaque navbar surface after scrolling; use the same surface on other pages and remove the extra search-input focus border.
- Reuse the Watchlist/Explore table for Analytics Top VS, ranked by combined token market cap, with price-window controls and sparklines while omitting watchlist stars in that section.
- Share maintained Redis Versus snapshots across Explore, Analytics Top VS, detail pages and Watchlist when Redis and live delivery are configured. Reads renew a ten-minute idle TTL, rolling price/volume windows advance without SQL, and cold reconstructions are coalesced across replicas.
- Refresh affected warm Versus rows from PostgreSQL once per trade batch and publish their Redis replacements atomically with chart updates and live notifications; retain unrelated markets and skip repeated market reads for duplicate deliveries.
- Cache private watchlist IDs separately, invalidating only the user's membership on add/remove, and hydrate market values from shared snapshots. Reconcile non-trade metadata through one shared minute probe; retain the short request-cache fallback when Redis/live configuration is absent or Redis cannot connect.
- Cache search-result IDs separately from their market values so search results reuse current shared snapshots.
- Start trading amount inputs empty and require a positive amount before quoting or submitting a trade.

### Fixed

- Calculate 5m, 1h, 6h and 24h token price changes from indexed prices at each window boundary for Analytics Top VS, Watchlist and Explore Table, replacing hardcoded short-window zeros and the truncated 24h sparkline calculation; refresh visible market tables every 15 seconds using maintained market snapshots when live delivery is configured.
- Apply light-theme surfaces and text colors throughout Versus detail pages and synchronize graduated DEX Screener embeds with the selected theme.
- Keep trading paused during on-chain migration even if an indexed pool chart is already available; prioritize confirmed contract migration/graduation status over stale indexed observations and resume trading after graduation independently of chart discovery.
- Normalize Goldsky graduation PoolIds to lowercase hex with exactly one `0x` prefix and replace removed `to_u256` conversions with exact `DECIMAL(78, 0)` casts for indexed event amounts.
- Give each wallet-provider render tree its own query client to prevent changing market-query data from being shared between server requests.

## [0.2.7] - 2026-10-08

### Added

- Display the Versus description below the creator metadata when provided, preserving line breaks and wrapping long text.
- Populate Profile's Referral overview with confirmed referral counts, active referrals with at least one recorded trade, and all-time referred volume in USD with an ETH fallback; add the active-referral count to profile statistics and version the statistics cache accordingly.

### Changed

- Expand Privacy Policy and Terms of Use with details on profiles, public blockchain activity, cookies, service providers, privacy requests, wallet security, transactions, fees, referrals, and acceptable use; update their revision date to October 8, 2026.
- Widen and align legal-page content, reduce hero and section spacing, and replace the background grid with a solid background.
- Replace `Korum Labs, LLC` with `Korum Labs` in legal pages, the footer, and the README.
- Replace the capped referral reward slider with a numeric USD input supporting nonnegative decimal values without the former $250,000 ceiling, with immediate reward recalculation.
- Remove the separate Rewards metric and referral-history placeholder from Referral overview; show an empty state only when no referrals are confirmed and direct users to the combined creator/referral fee claim.
- Replace Profile's trading-return simulator with the shared creation/referral earnings simulator, using English labels for planned VS count, average volume per VS, active referral count, and average monthly volume per referral; display creator revenue, referral revenue, and their combined projection.
- Compact Profile's Global simulator with a 960 px maximum width, smaller icons and values, and tighter controls and result cards.
- Halve desktop side gutters on Versus detail pages and enlarge small text throughout creator metadata, market statistics, chart controls, trading panels, and activity views; increase chart-axis text while retaining mobile gutters.
- Compact Earn and Concept around the Combined earnings table's proportions, with narrower content, smaller cards, artwork and typography, tighter section spacing, and single-column card layouts on mobile.
- Rename Explore's shared card action from `View Tokens` to `View versus`, widen the gap between camp images from 8 px to 12 px, and replace continuous image borders with fading corner accents and a subtle glow.

### Fixed

- Align Share on X with the other Versus sharing options by using a consistently sized SVG icon.
- Apply illustrative creator fee tiers to each VS's average volume before multiplying by the number of VS, rather than applying tiers to their aggregated volume; share the corrected calculation between Earn and Profile.

## [0.2.6] - 2026-10-07

### Added

- Authenticated token-image uploads to Pinata with server-side validation, WebP normalization (256 × 256, at most 100 KiB), and CID/provenance storage in Railway PostgreSQL; migration `0015` associates images with indexed token addresses through confirmed camp URIs.

### Changed

- Require a local image file for both tokens when creating a Versus, replacing public URI inputs; retain the 5 MiB input limit and upload both images before wallet signing, with retries reusing saved content.
- Resolve indexed token images through a configurable public Pinata gateway across Versus and profile views.

### Fixed

- Defer the reduced-motion stats update in `EarnHeroStats` to a cancellable animation frame, resolving the React effect lint error.

## [0.2.5] - 2026-10-07

### Added

- Claimable ETH fees and a wallet-confirmed FeeEscrow withdrawal in the Profile Managed Versus and Referrals sections, showing the wallet-wide balance and retaining access to accrued fees after creator rights are transferred.
- Indexed Versus holder counts based on distinct wallets with positive net token positions across either camp, excluding the zero address.
- Mocked fee-claim regression checks covering both Profile tabs, retained fees after rights transfers, successful withdrawals, unavailable or empty balances, transaction failures and network switching, without sending transactions.

### Changed

- Replace Explore and Watchlist grid cards with a shared, compact two-image layout showing creator avatars, per-camp market caps and price changes, camp shares, combined market cap, holders, 24-hour volume and watchlist controls; use a responsive four-to-one-column Explore grid with smaller images, tighter spacing and a compact View Tokens button.
- Replace inline Explore buy/sell controls with a View Tokens link to the Versus detail page; remove the legacy card component, unused quick-amount settings button and modal, compact trading-panel options and obsolete card styles.
- Rework Earn around the Create, Trade and Refer cards, with separate dark/light reference artwork, clearer revenue explanations and a maximum-total-fee notice; remove the video hero and animated hero statistics while retaining the earnings calculator.
- Widen responsive page gutters across the header, footer and core pages, limiting the main content to 1,200 px on large screens while retaining tablet and mobile spacing; keep the Earn calculator within those margins and derive sticky filter and mobile navigation offsets from the measured header height.
- Unify Concept and Earn card backgrounds in dark and light themes, and reduce the shared content-to-footer spacing to 32 px with explicit support for both pages' final sections.
- Make the entire connected-wallet summary a Profile link that closes the account menu.
- Restyle Versus trading panels with clearer buy/sell selection, selected amount and slippage controls, keyboard focus indicators and an arrow-led transaction button.
- Refine Concept card artwork and spacing, consolidate shared styles, and remove Explore's pointer-following spotlight while retaining animated grid streaks and reduced-motion support.
- Document the shared FeeEscrow claim flow, wallet-wide creator/referral balance and retained withdrawal rights in the referral and indexer architecture guide.

## [0.2.4] - 2026-10-03

### Added

- Verified DEX Screener charts for graduated Uniswap v4 tokens, with shared pool discovery and pending/testnet states.
- Functional Explore advanced filters for minimum combined market cap, minimum traders and creation age, with an active filter count and reset action.
- One-second Versus candles with a rolling five-minute window, second-level time labels and no historical pagination.

### Changed

- Stop Korum candle queries and Redis OHLC updates after bonding; retain indexed pool trades for analytics and show `Token has bonded and is graduating` with trading disabled during graduation.
- Broadcast confirmed trade prices, circulating market caps and volumes once per webhook batch; update active chart candles locally with cursor deduplication and gap recovery, without additional blockchain RPC calls.
- Synchronize only the latest chart page every minute while live, retaining polling and snapshot recovery after reconnects or indexed corrections.
- Maintain consulted chart windows in Redis with a ten-minute idle TTL, atomic trade updates and token revisions; share cold/recovery loads across replicas without periodic PostgreSQL rebuilds in quiet markets.
- Group managed camps by Versus in Profile and display their token images.

### Fixed

- Unify Profile tab icons and prevent hover states from being clipped.

## [0.2.3] - 2026-10-01

### Added

- Editable Versus social links for either current camp fee recipient, authorized by an off-chain wallet signature and stored separately from Goldsky projections (`0014_create_versus_socials_overrides.sql`); smart-account signatures are accepted at sign-in.
- Initial creator fee recipient address input at launch and a public per-camp notice of proposed protocol-owner changes with permissionless execution during the valid window.
- Creator fee recipient management per camp in Versus, including current on-chain recipient, pending owner proposals, simulation, wallet-confirmed transfers, and a Profile Managed Versus tab backed by indexed recipient changes.
- Migration `0013_creator_fee_recipient_history.sql` and a Factory event stream for recipient proposals, cancellations, and updates, while preserving the original launch creator.
- Authenticated My Holdings tab with on-chain ETH and Korum token balances, per-token USD liquidation estimates, and a total only when every known position can be valued.
- Approximate graduated-token holdings from the latest indexed pool spot price, clearly marked separately from bonding-curve liquidation values.
- Persist the emitting contract and graduated Uniswap v4 pool ID on indexed trades, with order-independent PostgreSQL synchronization and API provenance fields.
- Authenticated Goldsky trade webhook and shared Redis/SSE market notifications, with bounded payloads, PostgreSQL readiness checks, duplicate handling and snapshot recovery after reconnects.
- Live-feed integration checks covering two application instances, webhook authorization, reorg notifications, indexing lag and revisioned caches.
- Browser-persisted, global trade slippage controls with presets and a 0.1–20% custom range, applied to both bonding-curve and pool minimum-output checks.

### Changed

- Rename Versus API routes from `/api/debates` to `/api/versus`, including search, detail snapshots, and wallet positions.
- Reuse Explore's two-row token table for saved Versus in the Profile watchlist, including market metrics, sparklines, and the active watchlist star.
- Remove the technical network, creation-time, and data-source footer from Versus details, and replace user-facing infrastructure references with plain availability messages.
- Show the current on-chain creator fee recipient and full copyable wallet address for each camp in the Versus Token Creator tab, separately from the historical launch wallet.
- Refresh active Versus charts, market details and Explore trades on indexed trade notifications, retaining polling as a fallback and slowing routine polling while connected.
- Version market caches on committed trade changes and bypass browser/CDN caching for live market snapshots to avoid stale responses.
- Update the last chart candle incrementally when possible, preserve the visible time range during reconciliation, and drain ticker bursts without accumulating an artificial display delay.
- Build chart candles from trades as they arrive, including the current minute; fill inactive intervals with subtle unchanged-price ticks that retain the last trade color, and place price details below the chart.
- Mark the active candle with a subtle green or red pulse at its high or low, tracking chart pan and zoom while respecting reduced-motion preferences.
- Rework Versus detail layout to match the supplied reference, with shared page margins, a restored Explore back link, italic “VS”, aligned creator metadata, and translucent camp arrows behind the token titles.
- Show 25%, 50%, 75%, and 100% position shortcuts on Explore cards when selling, while keeping ETH shortcuts for purchases.

### Fixed

- Deploy the Factory fee-recipient event stream with corrected ABI decoding and historical backfill, so Managed Versus reflects transfers instead of retaining the recipient recorded at launch. The existing `0013` migration supplies the event table and current-recipient view; no additional recipient snapshot table is required.
- Update Versus camp percentages, market caps, and Leading indicators from the same fresh market data as the charts after trades; show no leader at an exact tie.
- Color negative leaderboard PNL red, including on the top-three podium.

## [0.2.2] - 2026-09-29

### Added

- Testnet v2 Lens, PairRegistry and Seeder integration, with deployment addresses, launch configuration and storage namespace selected by chain ID.
- Isolated v2 indexed projections and watchlists through migration `0011_create_v2_read_model.sql`, preserving v1 data and existing wallet profiles.
- Profile avatar upload, replacement, removal, and preview, with shared images in the header, Profile, leaderboard podium, and Versus creator panel.
- Bounded PostgreSQL avatar storage through migration `0010_create_user_avatars.sql`: JPEG/PNG/WebP uploads up to 5 MiB, server-side compression to 256 × 256 WebP up to 100 KiB, metadata stripping, decoded-image validation, and authenticated rate-limited updates.
- Confirmed on-chain referrer display in Profile, including the referrer's username when available and a copyable wallet address.
- Regression checks for image validation, two-wallet avatar isolation, notification ownership, and referral eligibility.
- Read-only v2 contract checks covering deployment wiring, native ETH admission, Lens quotes, calldata and fee rounding, plus wallet-session regression checks for cookie-restored connectors, delayed signatures, account changes and logout ordering.

### Changed

- Adapted launch and trading screens to native ETH v2: live graduation targets per side, curve-sized purchase shortcuts, clear launch errors and responsive cost summaries.
- Migrated testnet contract addresses and ABIs to v2, moved quotes to Lens, and resolved native ETH pair economics before launch previews and submission. The testnet preset uses config `1` and a graduation target of 0.042 ETH per side (0.084 ETH across both sides); mainnet remains unconfigured.
- Updated Core buy calldata, per-curve fee thresholds, Goldsky event decoding and deployment-scoped cache keys.
- Switched the existing staging Goldsky pipeline to v2 contracts and the `indexer_v2` schema, with a new source checkpoint for backfill and preserved v1 projections.
- Kept Profile avatar actions stacked on the right with responsive sizing, and shortened the displayed account address while preserving full-address copying.
- Reduced Concept audience-pill borders and made the Three steps card titles bold.
- Revalidated pending referrals before creation and trading, rejecting self-referrals and replacement of existing referrers while allowing reciprocal referrals.

### Fixed

- Deferred wallet account reads and provider subscriptions until Wagmi finishes restoring a live connector, preventing `connector.getProvider is not a function` during reconnection.
- Invalidated the server session and disconnected the dApp when the active wallet changes, including checks after reload and on tab focus, so the previous wallet’s profile cannot remain authenticated.
- Ignored stale session responses and serialized signature verification/logout so delayed signatures cannot restore the previous profile or overwrite a newer session.
- Cleared both session and sign-in challenge cookies on logout and reported unsuccessful logout responses.
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

[Unreleased]: https://github.com/farau/korum-project/compare/v0.2.2...HEAD
[0.2.2]: https://github.com/farau/korum-project/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/farau/korum-project/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/farau/korum-project/compare/0.1.0...v0.2.0
[0.1.0]: https://github.com/farau/korum-project/commit/131047a
