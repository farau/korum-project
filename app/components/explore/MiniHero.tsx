"use client";
import React from 'react';
import { useExploreSearch } from './ExploreSearchProvider';

export default function MiniHero() {
  const { query, setQuery } = useExploreSearch();

  return (
    <div className="mini-hero">
      <div className="mini-hero-inner">
        <div className="hero-search-wrap">
          <span className="icon">⌕</span>
          <input
            type="text"
            id="searchInput"
            placeholder="Search for a debate, token, or category…"
            className="korum-search-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <span className="tagline">
          Each side has <b>its own token.</b> Buy or sell the one you believe in, at any time.
        </span>
      </div>
    </div>
  );
}
