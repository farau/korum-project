"use client";

import React, { useState } from "react";
import { useMinuteClock } from "../../hooks/useMinuteClock";
import ExploreVsCard from "./ExploreVsCard";
import VsTable from "./VsTable";
import type { Debate } from "../../lib/debates";
import { useExplorePage } from "../../hooks/useIndexedMarkets";
import { useExploreCategory } from "./ExploreCategoryProvider";

import { EXPLORE_PAGE_SIZE as PAGE_SIZE, type ExplorePage, type ExploreOptions, type ExploreSort as SortMode, type ExploreAge as AgeFilter } from "../../lib/explore-page";
type PaginationItem = number | "start-ellipsis" | "end-ellipsis";

const ageFilters: Array<{ value: AgeFilter; label: string; minutes: number | null }> = [
  { value: "all", label: "All dates", minutes: null },
  { value: "1h", label: "< 1h", minutes: 60 },
  { value: "24h", label: "< 24h", minutes: 1440 },
  { value: "7d", label: "< 7d", minutes: 10080 },
];

function minimumValue(value: string) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

const sortLabels: Array<{ value: SortMode; label: string }> = [
  { value: "trending", label: "Trending" },
  { value: "marketCap", label: "Market cap" },
  { value: "volume", label: "Volume" },
  { value: "holders", label: "Most traders" },
  { value: "recent", label: "Newest" },
];

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

function PaginatedResults({ initialPage, options, view, now, resetFilters }: { initialPage?: ExplorePage; options: ExploreOptions; view: "grid" | "table"; now: number | null; resetFilters: () => void }) {
  const [currentPage, setCurrentPage] = useState(1);
  const query = useExplorePage({ ...options, page: currentPage }, initialPage);
  const result = query.data;
  const totalPages = result?.totalPages ?? 1;
  if (result && currentPage !== result.page) setCurrentPage(result.page);
  const pageStart = ((result?.page ?? currentPage) - 1) * PAGE_SIZE;
  const pageDebates = result?.items ?? [];
  if (!result) return <div className="explore-empty-versus" role="status">
    <h2>{query.isError ? "Live versus are temporarily unavailable" : "Loading versus…"}</h2>
    {query.isError ? <button type="button" className="btn" onClick={() => { void query.refetch(); }}>Try again</button> : null}
  </div>;
  if (!result.total) return <div className="explore-empty-versus" role="status">
    <span className="explore-empty-versus-icon" aria-hidden="true">VS</span>
    <h2>{result.catalogTotal ? "No matching versus" : "No versus available yet"}</h2>
    <p>{result.catalogTotal ? "Try a different category or filter." : "No Versus have been created yet."}</p>
    <button type="button" className="btn" onClick={resetFilters}>Reset filters</button>
  </div>;

  function goToPage(page: number) {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.querySelector(".explore-page .grid-section")?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  }

  return (
    <>
      {query.isError ? <p role="status">Unable to refresh versus. Showing the last available results.</p> : null}
      {view === "grid" ? (
        <div className="card-grid explore-versus-grid">
          {pageDebates.map((debate, index) => <ExploreVsCard key={debate.id} debate={debate} index={pageStart + index} />)}
        </div>
      ) : (
        <VsTable debates={pageDebates} ageLabel={(debate) => ageLabel(debate, now)} />
      )}

      {totalPages > 1 ? (
        <nav className="explore-pagination" aria-label="Explore results pagination">
          <p className="explore-pagination-status">
            Showing {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, result.total)} of {result.total} Versus
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
  initialPage?: ExplorePage;
};

export default function VsListClient({ initialPage }: VsListClientProps) {
  const { category } = useExploreCategory();
  const [sortMode, setSortMode] = useState<SortMode>("trending");
  const [menuOpen, setMenuOpen] = useState(false);
  const [marketCapMinInput, setMarketCapMinInput] = useState("");
  const [tradersMinInput, setTradersMinInput] = useState("");
  const [ageFilter, setAgeFilter] = useState<AgeFilter>("all");
  const marketCapMin = minimumValue(marketCapMinInput);
  const tradersMin = minimumValue(tradersMinInput);
  const activeFilterCount = Number(marketCapMin > 0) + Number(tradersMin > 0) + Number(ageFilter !== "all");
  const [view, setView] = useState<"grid" | "table">("grid");
  const now = useMinuteClock();

  const paginationKey = `indexed:${category}:${sortMode}:${marketCapMin}:${tradersMin}:${ageFilter}`;

  function resetAdvancedFilters() {
    setMarketCapMinInput("");
    setTradersMinInput("");
    setAgeFilter("all");
  }

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
                Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""} <span className="chevron">▾</span>
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
                    <label htmlFor="explore-market-cap-min">Market cap min</label>
                    <input id="explore-market-cap-min" type="number" min="0" step="any" placeholder="0" value={marketCapMinInput} onChange={(event) => setMarketCapMinInput(event.target.value)} />
                  </div>
                  <div className="adv-field">
                    <label htmlFor="explore-traders-min">Minimum traders</label>
                    <input id="explore-traders-min" type="number" min="0" step="1" placeholder="0" value={tradersMinInput} onChange={(event) => setTradersMinInput(event.target.value)} />
                  </div>
                  <div className="age-pill-row">
                    {ageFilters.map((filter) => (
                      <button type="button" key={filter.value} className={ageFilter === filter.value ? "active" : ""} aria-pressed={ageFilter === filter.value} onClick={() => setAgeFilter(filter.value)}>
                        {filter.label}
                      </button>
                    ))}
                  </div>
                  <button type="button" disabled={marketCapMinInput === "" && tradersMinInput === "" && ageFilter === "all"} onClick={resetAdvancedFilters}>Reset filters</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <PaginatedResults initialPage={initialPage} options={{ category, sort: sortMode, marketCapMin, tradersMin, age: ageFilter, page: 1 }}
          view={view} now={now} resetFilters={resetAdvancedFilters} key={paginationKey} />
      </div>
    </section>
  );
}
