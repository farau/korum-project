# Frontend architecture

Updated: 2026-10-25. Describes the local implementation; application rollout is
pending. See the [audit report](audit-codebase-2026-10-21.md) for dated validation
and unresolved dependency advisories.

## Layouts and wallet loading

The root `app/layout.tsx` owns HTML, metadata, fonts, initial theme and global CSS.
It does not read request cookies or mount the wallet SDK. Route groups preserve
existing URLs:

| Group | Routes | Providers |
| --- | --- | --- |
| `app/(public)` | Concept, Earn, Privacy, Terms | Lightweight `PublicProviders` and `AppFrame publicPage` |
| `app/(app)` | Explore, Analytics, Leaderboard, Create, Profile, Watchlist, Versus detail | Request-aware `RainbowKitProvider` and `AppFrame` |

`AppFrame` shares Header, Footer and Explore category context. `PageWrapper` is a
legacy pass-through. Public links disable automatic route prefetching so that
interactive routes do not eagerly download the wallet stack.

`WalletContext` exposes lightweight wallet state to shared UI. Public pages
dynamically import `PublicWalletRuntime` when Connect is requested, or when a
returning browser has a Wagmi cookie. Activation also checks `/api/auth/session`.
The runtime mounts beside the page and bridges wallet state back to its context;
activation preserves the public page DOM. A failed load exposes a retryable error.
Wallet-modal opening waits until the provider's initialization effects complete.

The interactive layout passes the raw `Cookie` header to Wagmi's decoder;
serializing `cookies()` would change the encoding of its JSON. Malformed Wagmi
cookies fall back to empty initial state. Session-cookie presence is passed
separately: anonymous mounts without a session do not delete a session or force
a server refresh. Wallet disconnect/session restoration retains its cleanup.

## Client data ownership

TanStack Query shares identical requests within the active provider. Private
query keys include wallet and deployment, and responses remain private/no-store.
Authorization always happens at the API boundary, not through query keys alone.

| Data | Client behavior |
| --- | --- |
| Watchlist | One wallet-scoped provider for IDs and mutations; full market objects only in Watchlist views. Ordered optimistic mutations, wallet guards, cancellation and one cross-tab subscription per session. |
| Profile statistics | One shared SSE connection per tab, authenticated wallet interest plus up to 25 position tokens. Relevant events coalesce over five seconds; reconnect/focus/reset reconcile, with a minute fallback only while disconnected. |
| Holdings | Wallet/deployment query shared across mounted Profile consumers. Request and response wallet checks; 120-second polling only in the Holdings panel. |
| Pending referral | Shared wallet/deployment query, 60-second stale time, removed when inactive. Clearing cancels pending work for that wallet; submission still performs fresh eligibility checks. |
| Explore | Page/filter/sort queries backed by the complete server ranking. Twelve objects per page; background changes preserve the selected page, deliberate filter changes reset it. |
| Analytics | Shared period queries for complete totals/categories and a separate global market-cap page for Top VS. No totals inferred from the legacy latest-100 list. |
| Leaderboard | Paginated server responses backed by a 30-second Redis ranking projection; ranks remain global after search. The complete trader list stays on the server. |

`useMinuteClock` gives cards/list rows one minute timer per browser module,
starting with the first subscriber and stopping with the last. This clock only
updates relative labels; it does not cause SQL reads. Snapshot ownership, shared
leases, recovery and fallback timings are specified in [Live market updates](market-live.md).

## Presentation and verification

Explore uses separate mobile 1x/2x WebP backgrounds for each theme. Initial theme
selection occurs while parsing HTML to avoid first downloading the wrong theme's
image. Sparklines show 96 quarter-hour closes, including unknown and inactive
intervals; they are not a tail of 96 trades.

The shared `wallet-shine-btn` style gives Header and Profile Connect buttons a
2px border in dark mode, white on top and grey on the other edges. Light mode
retains its existing border. The selector is scoped to wallet buttons.

`npm test` runs 22 isolated checks, and `npm run test:integration` runs eight
checks using local PostgreSQL/Redis. `npm run test:all` runs both. The workflow
in `.github/workflows/checks.yml` adds lint and a production build on Node 22.18;
its first GitHub execution remains pending. Local browser scripts exercise
Explore and public wallet/Analytics flows on synthetic data with external
requests blocked. They do not cover real extension signing or production RUM.
