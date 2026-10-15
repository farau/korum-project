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

type ExploreCategoryContextValue = {
  category: ExploreCategory;
  setCategory: (value: ExploreCategory) => void;
};

const ExploreCategoryContext = createContext<ExploreCategoryContextValue | null>(null);

export function ExploreCategoryProvider({ children }: { children: React.ReactNode }) {
  const [category, setCategory] = useState<ExploreCategory>("HotTake");
  const value = useMemo(() => ({ category, setCategory }), [category]);

  return (
    <ExploreCategoryContext.Provider value={value}>
      {children}
    </ExploreCategoryContext.Provider>
  );
}

export function useExploreCategory() {
  const context = useContext(ExploreCategoryContext);
  if (!context) throw new Error("useExploreCategory must be used within ExploreCategoryProvider");
  return context;
}
