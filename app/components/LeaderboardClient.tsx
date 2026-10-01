"use client";

import Image from "next/image";
import ProfileAvatar from "./ProfileAvatar";
import React, { useEffect, useRef, useState } from "react";
import { BADGE_TIERS, type BadgeTierName } from "../lib/badges";
import { formatMarketValue } from "../lib/markets/format";
import type { LeaderboardSort, TraderLeaderboardPage, TraderLeaderboardRow } from "../lib/leaderboard";
import { shortenAddress, useWallet } from "./WalletProvider";

function formatLeaderboardAmount(usd: number | null, eth: number | null, signed = false) {
  if (usd === null && eth === null) return "—";
  const value = usd ?? eth!;
  const formatted = formatMarketValue(Math.abs(value), usd === null ? "ETH" : "USD", usd === null ? 5 : 2);
  if (!signed || value === 0) return formatted;
  return value > 0 ? `+${formatted}` : `-${formatted}`;
}

function TierBadge({ badge }: { badge: BadgeTierName | null }) {
  if (!badge) return null;
  const tier = BADGE_TIERS.find((candidate) => candidate.name === badge);
  return tier ? <span className={`lb-tier-badge ${tier.className}`}><Image src="/korum-icons/Badge.svg" alt="" width={12} height={12} />{tier.name}</span> : null;
}

function CrownIcon() {
  return (
    <svg viewBox="0 0 73.07 65.16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="lbCrownRainbow" x1="0" y1="0" x2="73.07" y2="65.16" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#00a1fd" />
          <stop offset="25%" stopColor="#d794f3" />
          <stop offset="50%" stopColor="#f3d8ad" />
          <stop offset="75%" stopColor="#9dda72" />
          <stop offset="100%" stopColor="#07ccc3" />
        </linearGradient>
      </defs>
      <g fill="url(#lbCrownRainbow)">
        <path d="M56.04,23.89c-3.97,3.67-6.83,12.13-8.86,12.39-7.31.95-6.22-14.22-8.69-21.38-4.31,7.87-7.1,16.28-9.02,25.09-.14.63-.57,1.24-.88,1.5-1.37,1.17-4.33-1.21-6.76-3.27l2.74,13.89c.21,1.06.38,2.66-.66,3.23-.8.43-1.76-.84-2.33-1.2-3.48-.42-6.64-1.75-9.96-3.11l2.19,6.71c-.83.75-2.31-.1-2.84-1.14l-4.64-9.06c1.53-.77,2.92-.1,4.25.51,3.44,1.59,6.67,3.48,10.62,4.27-2.06-6.35-4.04-12.38-3.82-18.91,2.93-2,5.52,1.66,8.59,4.95,2.29-9.74,5.15-19.15,10.64-27.52,1.07-1.64,3.79,0,4.39,1.4,2.76,6.39,3.37,12.86,4.75,19.89,3.01-5.07,7.33-13.24,11.44-12.32,3.72.83,3.66,8.68,2.72,13.43l-1.99,10.08c3.46-2.63,7.63-5.19,10.24-2.82,2.75,2.5-1.03,11.58-2.49,16.7-.62,2.16-1.66,3.82-4.32,3.55-7.89-.8-15.59-.6-23.49.4-7.92,1-15.47,2.14-23.22,3.98-.51.12-1.34-.54-1.45-.86-.65-1.91,20.93-5.47,27.13-6.08,6.84-.67,13.31-.29,20.3-.04,1.83-5.06,3.39-10.05,4.48-15.67-3.55,1.32-5.57,4.01-7.48,6.75-.92.7-2.02.69-2.83.26-5.08-2.67,2.77-17.36,1.22-25.63Z" />
        <path d="M5.79,43.79c-.77,1.62-2.84.86-3.85.24-1.16-.72-2.55-2.16-1.64-3.67.63-1.05,2.93-.55,3.73.21.7.67,2.3,2.08,1.76,3.22Z" />
        <path d="M72.66,34.89c-.7,1.4-1.59,1.83-2.82,1.46-1-.3-1.67-1.23-1.63-2.56.03-1.12.66-1.97,1.42-2.3.9-.39,1.99-.21,2.66.26.99.69.95,1.98.36,3.14Z" />
        <path d="M39.38,4.44c-.9.73-2.48-.04-3.11-.49-.79-.56-1.53-1.81-.96-3.05s2.63-1.03,3.85-.28c1.02.62,1.68,2.64.23,3.83Z" />
        <path d="M60.97,9.28c1.83,1.26.16,4.36-.45,4.58-.49.17-1.24.05-1.88-.46-1.07-.86-1.38-3.03-.51-4.23.68-.94,2.21-.33,2.84.1Z" />
        <path d="M17.4,27.87c-.71.77-2.15.19-2.76-.26-.7-.51-1.8-1.55-1.17-2.78.47-.92,2.26-.55,2.92.11.61.6,1.65,2.23,1.01,2.93Z" />
      </g>
    </svg>
  );
}

function RankingRow({ row, isCurrentUser }: { row: TraderLeaderboardRow; isCurrentUser: boolean }) {
  return (
    <div className={`lb-row${isCurrentUser ? " lb-row-me" : ""}`}>
      <span className="lb-rank">#{row.rank}</span>
      <span className="lb-name">
        {row.name.startsWith("0x") ? shortenAddress(row.name) : row.name}
        <TierBadge badge={row.badge} />
        {isCurrentUser ? <span className="lb-you-tag">YOU</span> : null}
      </span>
      <span className={(row.pnlUsd ?? row.pnlEth ?? 0) < 0 ? "lb-vol sell" : "lb-vol buy"}>{formatLeaderboardAmount(row.pnlUsd, row.pnlEth, true)}</span>
      <span className="lb-vol">{formatLeaderboardAmount(row.volumeUsd, row.volumeEth)}</span>
      <span className="lb-win">{row.tradeCount.toLocaleString("en-US")}</span>
    </div>
  );
}

export default function LeaderboardClient({ initialData }: { initialData: TraderLeaderboardPage }) {
  const [data, setData] = useState(initialData);
  const [podiumRows, setPodiumRows] = useState(initialData.items.slice(0, 3));
  const [sort, setSort] = useState<LeaderboardSort>(initialData.sort);
  const [searchInput, setSearchInput] = useState(initialData.search);
  const [search, setSearch] = useState(initialData.search);
  const [page, setPage] = useState(initialData.page);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const skipInitialRequest = useRef(true);
  const { address } = useWallet();
  const podiumEntries = [
    { row: podiumRows[1], place: 2 },
    { row: podiumRows[0], place: 1 },
    { row: podiumRows[2], place: 3 },
  ].filter((entry): entry is { row: TraderLeaderboardRow; place: number } => Boolean(entry.row));

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setPage(1);
      setSearch(searchInput.trim());
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    if (skipInitialRequest.current) {
      skipInitialRequest.current = false;
      return;
    }

    const controller = new AbortController();
    const parameters = new URLSearchParams({ page: String(page), sort });
    if (search) parameters.set("search", search);
    setLoading(true);
    setError(null);

    fetch(`/api/leaderboard?${parameters}`, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json() as TraderLeaderboardPage & { error?: string };
        if (!response.ok) throw new Error(result.error || "Unable to load the leaderboard.");
        setData(result);
        if (result.page === 1 && !result.search) setPodiumRows(result.items.slice(0, 3));
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Unable to load the leaderboard.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [page, search, sort]);

  function selectSort(nextSort: LeaderboardSort) {
    setPage(1);
    setSort(nextSort);
  }

  return (
    <div className="page leaderboard-page" id="page-leaderboard">
      <section className="lb-title-section">
        <div className="wrap lb-title-inner">
          <span className="lb-crown-icon"><CrownIcon /></span>
          <h1 className="lb-main-title">LEADERBOARD</h1>
        </div>

        {!search && (
          <div className="lb-podium" aria-label="Leaderboard podium">
            <span className="lb-podium-blocks-bg" aria-hidden="true" />
            {podiumEntries.map(({ row, place }) => (
              <article className={`lb-podium-card rank${place}`} key={row.wallet}>
                <div className="lb-podium-avatar-wrap">
                  <span className="lb-podium-avatar"><ProfileAvatar address={row.wallet} className="profile-avatar-round" /></span>
                </div>
                <strong className="lb-podium-name" title={row.name}>
                  {row.name.startsWith("0x") ? shortenAddress(row.name) : row.name}
                </strong>
                <TierBadge badge={row.badge} />
                <span className={`lb-podium-pnl${(row.pnlUsd ?? row.pnlEth ?? 0) < 0 ? " negative" : ""}`}>{formatLeaderboardAmount(row.pnlUsd, row.pnlEth, true)}</span>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="vs-hero-section leaderboard-hero">
        <div className="wrap">
          <span className="vs-hero-badge">Ranking</span>
          <h2 className="vs-hero-title">Who rules Korum</h2>
          <p>All-time trader rankings based on trading volume and estimated bonding-curve PNL.</p>
          <label className="lb-search-wrap">
            <span className="icon" aria-hidden="true">⌕</span>
            <span className="sr-only">Search by username</span>
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search by username or wallet…"
            />
          </label>
        </div>
      </section>

      <section className="info-section leaderboard-section">
        <div className="wrap">
          <div className="lb-controls-row"><span className="vs-hero-badge">All-time traders</span></div>

          <div className="lb-table-wrap" role="table" aria-label="Korum leaderboard">
            <div className="lb-row head" role="row">
              <span>#</span>
              <span>Username</span>
              <button type="button" className={`lb-sortable ${sort === "pnl" ? "active" : ""}`} onClick={() => selectSort("pnl")}>PnL</button>
              <button type="button" className={`lb-sortable ${sort === "volume" ? "active" : ""}`} onClick={() => selectSort("volume")}>Volume</button>
              <span className="lb-align-right">Trades</span>
            </div>
            {data.items.map((row) => (
              <RankingRow row={row} isCurrentUser={Boolean(address && row.wallet.toLowerCase() === address.toLowerCase())} key={row.wallet} />
            ))}
          </div>

          {loading ? <p className="lb-nomatch" aria-live="polite">Updating leaderboard…</p> : null}
          {error ? <p className="lb-nomatch" role="alert">{error}</p> : null}
          {!loading && !error && data.items.length === 0 ? <p className="lb-nomatch">No trader matches your search.</p> : null}
          {data.totalPages > 1 ? (
            <nav className="explore-pagination" aria-label="Leaderboard pagination">
              <p className="explore-pagination-status">Page {data.page} of {data.totalPages} · {data.totalItems} traders</p>
              <div className="explore-pagination-controls">
                <button type="button" className="explore-pagination-nav" disabled={page === 1 || loading} onClick={() => setPage((current) => current - 1)}>← <span>Previous</span></button>
                <button type="button" className="explore-pagination-page active" aria-current="page" disabled>{data.page}</button>
                <button type="button" className="explore-pagination-nav" disabled={page >= data.totalPages || loading} onClick={() => setPage((current) => current + 1)}><span>Next</span> →</button>
              </div>
            </nav>
          ) : null}
        </div>
      </section>
    </div>
  );
}
