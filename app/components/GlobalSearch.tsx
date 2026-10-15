"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { useIndexedDebateSearch } from "../hooks/useIndexedMarkets";

export default function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmedQuery = query.trim();

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(trimmedQuery), 400);
    return () => window.clearTimeout(timer);
  }, [trimmedQuery]);

  const search = useIndexedDebateSearch(debouncedQuery, open && trimmedQuery.length >= 2 && trimmedQuery === debouncedQuery);
  const pending = trimmedQuery !== debouncedQuery || search.isPending || search.isPlaceholderData;
  const results = !pending && !search.isError ? search.data ?? [] : [];
  const showPanel = open && trimmedQuery.length > 0;

  useEffect(() => {
    if (!open) return;
    function closeOutside(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setMobileOpen(false);
      }
    }
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  function resultLinks() {
    return Array.from(containerRef.current?.querySelectorAll<HTMLAnchorElement>(".header-search-result") ?? []);
  }

  function closeSearch() {
    if (mobileOpen) toggleRef.current?.focus();
    else inputRef.current?.focus();
    setOpen(false);
    setMobileOpen(false);
  }

  return (
    <div className={`global-search${mobileOpen ? " mobile-open" : ""}`} ref={containerRef}>
    <button
      ref={toggleRef}
      type="button"
      className="mobile-search-toggle icon-btn header-icon"
      aria-label={mobileOpen ? "Close search" : "Open search"}
      aria-expanded={mobileOpen}
      aria-controls="global-search-form"
      onClick={() => {
        if (mobileOpen) closeSearch();
        else {
          flushSync(() => { setMobileOpen(true); setOpen(true); });
          inputRef.current?.focus();
        }
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
    </button>
    <form
      id="global-search-form"
      className="header-search"
      role="search"
      aria-label="Search versus"
      onBlur={(event) => {
        if (event.relatedTarget && !containerRef.current?.contains(event.relatedTarget as Node)) {
          setOpen(false);
          setMobileOpen(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          closeSearch();
        }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          setOpen(true);
          const links = resultLinks();
          const index = links.indexOf(document.activeElement as HTMLAnchorElement);
          const next = event.key === "ArrowDown" ? index + 1 : index - 1;
          if (next < 0) inputRef.current?.focus();
          else links[Math.min(next, links.length - 1)]?.focus();
        }
      }}
      onSubmit={(event) => {
        event.preventDefault();
        if (showPanel) resultLinks()[0]?.click();
        else setOpen(true);
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-haspopup="dialog"
        aria-autocomplete="list"
        aria-label="Search versus by name, token, or contract address"
        aria-expanded={showPanel}
        aria-controls="header-search-results"
        placeholder="Search a versus, token or contract address…"
        maxLength={100}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
      />
      <button type="button" className="mobile-search-close" aria-label="Close search" onClick={closeSearch}>×</button>
      {mobileOpen && !trimmedQuery ? <p className="mobile-search-hint">Find a versus by name, token or contract address.</p> : null}
      {showPanel ? (
        <section className="header-search-panel" id="header-search-results" role="dialog" aria-label="Versus search results">
          <div className="header-search-panel-heading"><strong>Versus</strong><button type="button" aria-label="Close search results" onClick={closeSearch}>×</button></div>
          {trimmedQuery.length < 2 ? <p role="status">Enter at least 2 characters to search.</p>
            : pending ? <p role="status">Searching…</p>
            : search.isError ? <div className="header-search-message" role="alert">Search is temporarily unavailable. <button type="button" onClick={() => void search.refetch()}>Try again</button></div>
            : results.length === 0 ? <p role="status">No versus found.</p>
            : <div className="header-search-results">
              {results.map((debate) => (
                <Link className="header-search-result" href={`/vs/${debate.id}`} key={debate.id} prefetch={false} onClick={() => { setOpen(false); setMobileOpen(false); setQuery(""); }}>
                  <span className="header-search-result-mark" aria-hidden="true">VS</span>
                  <span className="header-search-result-copy"><strong>{debate.sideA} <span>vs</span> {debate.sideB}</strong><small>{debate.title || debate.category}</small><small>{[debate.tokenA?.symbol || debate.tokenASymbol, debate.tokenB?.symbol || debate.tokenBSymbol].filter(Boolean).join(" · ")}</small></span>
                  <span aria-hidden="true">↗</span>
                </Link>
              ))}
            </div>}
        </section>
      ) : null}
    </form>
    </div>
  );
}
