"use client";

import React, { useEffect, useMemo, useState } from "react";
import VsCard from "./VsCard";
import type { Debate } from "../../lib/debates";
import { useMock } from "../MockProvider";
import { useExploreSearch } from "./ExploreSearchProvider";

type SortMode = "trending" | "marketCap" | "volume" | "holders" | "recent";

const sortLabels: Array<{ value: SortMode; label: string }> = [
  { value: "trending", label: "Trending" },
  { value: "marketCap", label: "Market cap" },
  { value: "volume", label: "Volume" },
  { value: "holders", label: "Most traders" },
  { value: "recent", label: "Newest" },
];

function totalMarketCap(debate: Debate) {
  return (debate.tokenA?.marketCap ?? debate.marketCapA ?? 0) + (debate.tokenB?.marketCap ?? debate.marketCapB ?? 0);
}

function debateVolume(debate: Debate) {
  return debate.volume24h;
}

function debateParticipants(debate: Debate) {
  return debate.holderCount ?? debate.participantCount ?? 0;
}

function timestampMs(value?: string | number) {
  if (typeof value === "number") return value < 10_000_000_000 ? value * 1000 : value;
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function newestTimestamp(debate: Debate) {
  return Math.max(
    timestampMs(debate.tokenA?.launchedAtUtc || debate.tokenA?.launchedAt) ?? timestampMs(debate.tokenA?.launchTimestamp) ?? 0,
    timestampMs(debate.tokenB?.launchedAtUtc || debate.tokenB?.launchedAt) ?? timestampMs(debate.tokenB?.launchTimestamp) ?? 0,
    timestampMs(debate.launchedAtUtc || debate.launchedAt || debate.createdAtUtc || debate.createdAt) ?? timestampMs(debate.launchTimestamp ?? debate.createdAtTimestamp) ?? 0
  );
}

function ageHours(debate: Debate, now: number | null) {
  const timestamp = newestTimestamp(debate);
  if (!timestamp || !now) return Math.round(debate.createdMinutesAgo / 60);
  return Math.max(0, Math.round((now - timestamp) / 3_600_000));
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function compactSearch(value: string) {
  return normalizeSearch(value).replace(/[^a-z0-9]/g, "");
}

function matchesSearch(debate: Debate, query: string) {
  if (!query) return true;
  const value = `${debate.tokenA?.name || debate.sideA} ${debate.tokenB?.name || debate.sideB} ${debate.tokenA?.symbol || debate.tokenASymbol || ""} ${debate.tokenB?.symbol || debate.tokenBSymbol || ""} ${debate.category}`;
  return normalizeSearch(value).includes(query) || compactSearch(value).includes(compactSearch(query));
}

export default function VsListClient({ debates }: { debates: Debate[] }) {
  const { mockEnabled } = useMock();
  const { query, category } = useExploreSearch();
  const [sortMode, setSortMode] = useState<SortMode>("trending");
  const [menuOpen, setMenuOpen] = useState(false);
  const [view, setView] = useState<"grid" | "table">("grid");
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const syncNow = () => setNow(Date.now());
    const kickoff = window.setTimeout(syncNow, 0);
    const timer = window.setInterval(syncNow, 60_000);
    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(timer);
    };
  }, []);

  const filtered = useMemo(() => {
    if (!mockEnabled) return [];
    const normalizedQuery = normalizeSearch(query);
    const list = category === "HotTake"
      ? [...debates].sort((a, b) => debateVolume(b) - debateVolume(a)).slice(0, 12)
      : debates.filter((debate) => category === "All" || normalizeSearch(debate.category) === normalizeSearch(category));
    const searchedList = list.filter((debate) => matchesSearch(debate, normalizedQuery));
    if (sortMode === "marketCap" || sortMode === "trending") searchedList.sort((a, b) => totalMarketCap(b) - totalMarketCap(a));
    if (sortMode === "volume") searchedList.sort((a, b) => debateVolume(b) - debateVolume(a));
    if (sortMode === "holders") searchedList.sort((a, b) => debateParticipants(b) - debateParticipants(a));
    if (sortMode === "recent") searchedList.sort((a, b) => newestTimestamp(b) - newestTimestamp(a));
    return searchedList.slice(0, sortMode === "trending" ? 12 : debates.length);
  }, [category, debates, mockEnabled, query, sortMode]);

  return (
    <section className="grid-section">
      <div className="wrap">
        <div className="grid-section-head">
          <div className="grid-table-switch">
            <button className={`gts-label ${view === "grid" ? "active" : ""}`} type="button" onClick={() => setView("grid")}>Grid</button>
            <button
              type="button"
              className="gts-track"
              data-active={view}
              role="switch"
              aria-checked={view === "table"}
              aria-label="Switch between grid and table views"
              onClick={() => setView(view === "grid" ? "table" : "grid")}
            >
              <span className="gts-knob" />
            </button>
            <button className={`gts-label ${view === "table" ? "active" : ""}`} type="button" onClick={() => setView("table")}>Table</button>
          </div>

          <div className="filter-right-group">
            <div className={`custom-select ${menuOpen ? "open" : ""}`}>
              <button type="button" className="custom-select-btn filters-toggle" onClick={() => setMenuOpen((open) => !open)}>
                Filters <span className="chevron">▾</span>
              </button>
              <div className="custom-select-menu filters-sort-menu">
                <div className="fs-section-title">Sort by</div>
                {sortLabels.map((item) => (
                  <button
                    type="button"
                    className={`fs-sort-opt ${sortMode === item.value ? "active" : ""}`}
                    key={item.value}
                    onClick={() => {
                      setSortMode(item.value);
                      setMenuOpen(false);
                    }}
                  >
                    {item.label}
                  </button>
                ))}
                <div className="fs-divider" />
                <div className="fs-section-title">Advanced filters</div>
                <div className="adv-filters">
                  <div className="adv-field">
                    <label>Market cap min</label>
                    <input type="number" placeholder="0" />
                  </div>
                  <div className="adv-field">
                    <label>Minimum traders</label>
                    <input type="number" placeholder="0" />
                  </div>
                  <div className="age-pill-row">
                    <button type="button" className="active">All dates</button>
                    <button type="button">&lt; 1h</button>
                    <button type="button">&lt; 24h</button>
                    <button type="button">&lt; 7d</button>
                  </div>
                </div>
              </div>
            </div>
            <button type="button" className="icon-btn" aria-label="Set quick amounts" title="Set quick amounts">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>
        </div>

        {view === "grid" ? (
          <div className="card-grid">
            {filtered.map((debate, index) => <VsCard key={debate.id} debate={debate} index={index} />)}
          </div>
        ) : (
          <div className="vs-table-wrap">
            <table className="vs-table">
              <thead>
                <tr>
                  <th>VS</th>
                  <th className="num">MCap</th>
                  <th className="num">Age</th>
                  <th className="num">Vol 24h</th>
                  <th className="num">Traders</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((debate) => (
                  <tr key={debate.id}>
                    <td>{debate.tokenA?.name || debate.sideA} vs {debate.tokenB?.name || debate.sideB}</td>
                    <td className="num mono">${Math.round(totalMarketCap(debate)).toLocaleString("en-US")}</td>
                    <td className="num muted">{ageHours(debate, now)}h</td>
                    <td className="num mono">${debateVolume(debate).toLocaleString("en-US")}</td>
                    <td className="num mono">{debateParticipants(debate).toLocaleString("en-US")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
