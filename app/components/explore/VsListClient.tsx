"use client";

import React, { useEffect, useMemo, useState } from "react";
import VsCard from "./VsCard";
import VsTable from "./VsTable";
import type { Debate } from "../../lib/debates";
import { useIndexedDebates, useIndexedDebateSearch } from "../../hooks/useIndexedMarkets";
import { useExploreSearch } from "./ExploreSearchProvider";

type SortMode = "trending" | "marketCap" | "volume" | "holders" | "recent";
type PaginationItem = number | "start-ellipsis" | "end-ellipsis";

const PAGE_SIZE = 12;
const EMPTY_DEBATES: Debate[] = [];

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
  return debate.participantCount ?? 0;
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

function ageLabel(debate: Debate, now: number | null) {
  const timestamp = newestTimestamp(debate);
  const minutes = timestamp && now
    ? Math.max(0, Math.floor((now - timestamp) / 60_000))
    : Math.max(0, debate.createdMinutesAgo);

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function useDebouncedValue(value: string, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);
  return debouncedValue;
}

function paginationItems(currentPage: number, totalPages: number): PaginationItem[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);

  const items: PaginationItem[] = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);
  if (start > 2) items.push("start-ellipsis");
  for (let page = start; page <= end; page += 1) items.push(page);

  if (end < totalPages - 1) items.push("end-ellipsis");
  items.push(totalPages);
  return items;
}

function PaginatedResults({ debates, view, now }: { debates: Debate[]; view: "grid" | "table"; now: number | null }) {
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.ceil(debates.length / PAGE_SIZE);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageDebates = debates.slice(pageStart, pageStart + PAGE_SIZE);

  function goToPage(page: number) {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.querySelector(".explore-page .grid-section")?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  }

  return (
    <>
      {view === "grid" ? (
        <div className="card-grid">
          {pageDebates.map((debate, index) => <VsCard key={debate.id} debate={debate} index={pageStart + index} inlineTrading />)}
        </div>
      ) : (
        <VsTable debates={pageDebates} ageLabel={(debate) => ageLabel(debate, now)} />
      )}

      {totalPages > 1 ? (
        <nav className="explore-pagination" aria-label="Explore results pagination">
          <p className="explore-pagination-status">
            Showing {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, debates.length)} of {debates.length} Versus
          </p>
          <div className="explore-pagination-controls">
            <button type="button" className="explore-pagination-nav" disabled={currentPage === 1} onClick={() => goToPage(currentPage - 1)} aria-label="Previous page">← <span>Previous</span></button>
            {paginationItems(currentPage, totalPages).map((item) => typeof item === "number" ? (
              <button
                type="button"
                className={`explore-pagination-page${item === currentPage ? " active" : ""}`}
                aria-current={item === currentPage ? "page" : undefined}
                aria-label={`Page ${item}`}
                onClick={() => goToPage(item)}
                key={item}
              >
                {item}
              </button>
            ) : <span className="explore-pagination-ellipsis" aria-hidden="true" key={item}>…</span>)}
            <button type="button" className="explore-pagination-nav" disabled={currentPage === totalPages} onClick={() => goToPage(currentPage + 1)} aria-label="Next page"><span>Next</span> →</button>
          </div>
        </nav>
      ) : null}
    </>
  );
}

type VsListClientProps = {
  indexedDebates: Debate[];
  indexedReadFailed: boolean;
};

export default function VsListClient({ indexedDebates, indexedReadFailed }: VsListClientProps) {
  const liveDebates = useIndexedDebates(indexedDebates);
  const { query, category } = useExploreSearch();
  const trimmedQuery = query.trim();
  const searchTooShort = trimmedQuery.length > 0 && trimmedQuery.length < 2;
  const debouncedQuery = useDebouncedValue(trimmedQuery, 400);
  const activeSearchQuery = trimmedQuery.length >= 2 && debouncedQuery.length >= 2 ? debouncedQuery : "";
  const searchedDebates = useIndexedDebateSearch(activeSearchQuery, Boolean(activeSearchQuery));
  const [sortMode, setSortMode] = useState<SortMode>("trending");
  const [menuOpen, setMenuOpen] = useState(false);
  const [view, setView] = useState<"grid" | "table">("grid");
  const [now, setNow] = useState<number | null>(null);
  const baseDebates = liveDebates.data ?? indexedDebates;
  const currentIndexedDebates = activeSearchQuery ? searchedDebates.data ?? EMPTY_DEBATES : baseDebates;
  const searchPending = trimmedQuery.length >= 2 && (trimmedQuery !== debouncedQuery || searchedDebates.isPending || searchedDebates.isPlaceholderData);
  const currentIndexedReadFailed = currentIndexedDebates.length === 0 && (activeSearchQuery ? searchedDebates.isError : indexedReadFailed || liveDebates.isError);
  const indexedFeedEmpty = !trimmedQuery && baseDebates.length === 0;

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
    const debates = currentIndexedDebates;
    const list = category === "HotTake"
      ? [...debates].sort((a, b) => debateVolume(b) - debateVolume(a)).slice(0, 12)
      : debates.filter((debate) => category === "All" || normalizeSearch(debate.category) === normalizeSearch(category));
    const searchedList = [...list];
    if (sortMode === "marketCap" || sortMode === "trending") searchedList.sort((a, b) => totalMarketCap(b) - totalMarketCap(a));
    if (sortMode === "volume") searchedList.sort((a, b) => debateVolume(b) - debateVolume(a));
    if (sortMode === "holders") searchedList.sort((a, b) => debateParticipants(b) - debateParticipants(a));
    if (sortMode === "recent") searchedList.sort((a, b) => newestTimestamp(b) - newestTimestamp(a));
    return searchedList;
  }, [category, currentIndexedDebates, sortMode]);

  const paginationKey = `indexed:${category}:${activeSearchQuery}:${sortMode}:${filtered.map((debate) => debate.id).join(",")}`;

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
              <button
                type="button"
                className="custom-select-btn filters-toggle"
                aria-expanded={menuOpen}
                aria-controls="explore-filters-menu"
                onClick={() => setMenuOpen((open) => !open)}
              >
                Filters <span className="chevron">▾</span>
              </button>
              <div
                id="explore-filters-menu"
                className="custom-select-menu filters-sort-menu"
                aria-hidden={!menuOpen}
              >
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

        {searchTooShort ? (
          <div className="explore-empty-versus" role="status" aria-live="polite">
            <span className="explore-empty-versus-icon" aria-hidden="true">VS</span>
            <h2>Keep typing…</h2>
            <p>Enter at least 2 characters to search all versus.</p>
          </div>
        ) : searchPending ? (
          <div className="explore-empty-versus" role="status" aria-live="polite">
            <span className="explore-empty-versus-icon" aria-hidden="true">VS</span>
            <h2>Searching versus…</h2>
            <p>Querying the complete Railway index.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="explore-empty-versus" role="status">
            <span className="explore-empty-versus-icon" aria-hidden="true">VS</span>
            <h2>{currentIndexedReadFailed
              ? "Live versus are temporarily unavailable"
              : indexedFeedEmpty
                ? "No versus available yet"
                : "No matching versus"}</h2>
            <p>{currentIndexedReadFailed
              ? "Explore could not read the Railway indexer. Try again shortly."
              : indexedFeedEmpty
                ? "Goldsky has not projected any complete versus yet."
                : "Try a different search, category, or sorting option."}</p>
          </div>
        ) : (
          <PaginatedResults debates={filtered} view={view} now={now} key={paginationKey} />
        )}
      </div>
    </section>
  );
}
