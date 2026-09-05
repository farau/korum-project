"use client";

import React, { createContext, useContext, useMemo, useState } from "react";

export type ExploreCategory =
  | "HotTake"
  | "All"
  | "Memes"
  | "Politics"
  | "Sports"
  | "Crypto"
  | "Pop culture"
  | "Movies & TV"
  | "Music"
  | "Tech"
  | "Gaming"
  | "WTF";

type ExploreSearchContextValue = {
  query: string;
  setQuery: (value: string) => void;
  category: ExploreCategory;
  setCategory: (value: ExploreCategory) => void;
};

const ExploreSearchContext = createContext<ExploreSearchContextValue | null>(null);

export function ExploreSearchProvider({ children }: { children: React.ReactNode }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ExploreCategory>("HotTake");
  const value = useMemo(() => ({ query, setQuery, category, setCategory }), [category, query]);

  return (
    <ExploreSearchContext.Provider value={value}>
      {children}
    </ExploreSearchContext.Provider>
  );
}

export function useExploreSearch() {
  const context = useContext(ExploreSearchContext);
  if (!context) throw new Error("useExploreSearch must be used within ExploreSearchProvider");
  return context;
}
