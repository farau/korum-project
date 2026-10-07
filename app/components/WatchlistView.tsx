"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { useWatchlist } from "../hooks/useWatchlist";
import ExploreVsCard from "./explore/ExploreVsCard";

function formatMoney(value: number) {
  return `$${Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value)}`;
}

export default function WatchlistView() {
  const { ids, debates, ready } = useWatchlist();
  const items = debates.filter((debate) => ids.includes(debate.id));
  const stats = useMemo(() => {
    const volume = items.reduce((sum, debate) => sum + debate.volume24h, 0);
    const traders = items.reduce((sum, debate) => sum + debate.participantCount, 0);
    return { volume, traders };
  }, [items]);

  return (
    <div className="page watchlist-page">
      <section className="vs-hero-section subpage-hero">
        <div className="wrap">
          <span className="vs-hero-badge">Watchlist</span>
          <h1 className="vs-hero-title">Your matchups to watch</h1>
          <p>Keep hot debates, positions you want to follow, and the sides you care about close at hand.</p>
        </div>
      </section>

      <section className="info-section subpage-section">
        <div className="wrap">
          <div className="subpage-stats-row">
            <div className="glass-stat-card"><span className="lbl">Tracked VS</span><span className="val">{ready ? ids.length : "..."}</span></div>
            <div className="glass-stat-card"><span className="lbl">Combined 24h volume</span><span className="val">{formatMoney(stats.volume)}</span></div>
            <div className="glass-stat-card"><span className="lbl">Exposed traders</span><span className="val">{stats.traders.toLocaleString("en-US")}</span></div>
          </div>

          {!ready ? (
            <div className="empty-state-card">Loading your watchlist...</div>
          ) : ids.length === 0 ? (
            <div className="empty-state-card">
              <span className="empty-kicker">No pinned VS</span>
              <h2>Your watchlist is empty</h2>
              <p>Add debates from Explore using the star on each card. They will appear here with their market stats.</p>
              <Link className="btn btn-solid" href="/explore">Explore VS</Link>
            </div>
          ) : (
            <div className="card-grid watchlist-grid">
              {items.map((debate, index) => <ExploreVsCard key={debate.id} debate={debate} index={index} />)}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
