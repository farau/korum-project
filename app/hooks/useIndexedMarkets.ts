"use client";

import { useQuery } from "@tanstack/react-query";

import { DEPLOYMENT_CACHE_SCOPE } from "../config/deployment";

import type { Debate } from "../lib/debates";
import { DEFAULT_EXPLORE_OPTIONS, type ExploreOptions, type ExplorePage } from "../lib/explore-page";

export const INDEXED_DEBATES_QUERY_KEY = ["indexed-debates", DEPLOYMENT_CACHE_SCOPE] as const;
export const INDEXED_DEBATES_SEARCH_QUERY_KEY = `indexed-debates-search:${DEPLOYMENT_CACHE_SCOPE}`;
export const INDEXED_DEBATE_QUERY_KEY = `indexed-debate:${DEPLOYMENT_CACHE_SCOPE}`;
export const TOKEN_CHART_QUERY_KEY = `token-chart:${DEPLOYMENT_CACHE_SCOPE}`;
export const TOKEN_TRADES_QUERY_KEY = `token-trades:${DEPLOYMENT_CACHE_SCOPE}`;
export const RECENT_MARKET_TRADES_QUERY_KEY = `recent-market-trades:${DEPLOYMENT_CACHE_SCOPE}`;
export const PROFILE_STATS_QUERY_KEY = `profile-stats:${DEPLOYMENT_CACHE_SCOPE}`;

const DEBATES_REFRESH_MS = 15_000;
const DETAIL_REFRESH_MS = 15_000;
const SEARCH_CACHE_MS = 45_000;

async function jsonResponse<T>(url: string, signal?: AbortSignal) {
  const response = await fetch(url, { signal, cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to refresh indexed market data (${response.status}).`);
  return response.json() as Promise<T>;
}

export function useIndexedDebates(initialData?: Debate[], enabled = true, refreshInterval = DEBATES_REFRESH_MS) {
  return useQuery({
    queryKey: INDEXED_DEBATES_QUERY_KEY,
    queryFn: ({ signal }) => jsonResponse<Debate[]>("/api/versus", signal),
    initialData,
    enabled,
    staleTime: refreshInterval,
    refetchInterval: enabled ? refreshInterval : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}

export function useExplorePage(options: ExploreOptions, initialData?: ExplorePage) {
  const params = new URLSearchParams({ view: "explore", ...Object.fromEntries(Object.entries(options).map(([key, value]) => [key, String(value)])) });
  return useQuery({
    queryKey: [...INDEXED_DEBATES_QUERY_KEY, "page", options],
    queryFn: ({ signal }) => jsonResponse<ExplorePage>(`/api/versus?${params}`, signal),
    initialData: Object.entries(DEFAULT_EXPLORE_OPTIONS).every(([key, value]) => options[key as keyof ExploreOptions] === value) ? initialData : undefined,
    staleTime: DEBATES_REFRESH_MS, refetchInterval: DEBATES_REFRESH_MS, refetchIntervalInBackground: false, retry: 1,
  });
}

export function useIndexedDebateSearch(query: string, enabled = true) {
  return useQuery({
    queryKey: [INDEXED_DEBATES_SEARCH_QUERY_KEY, query],
    queryFn: ({ signal }) => jsonResponse<Debate[]>(`/api/versus/search?q=${encodeURIComponent(query)}`, signal),
    enabled: enabled && query.length >= 2,
    staleTime: SEARCH_CACHE_MS,
    placeholderData: (previousData) => previousData,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useIndexedDebate(versusId: string, initialData: Debate | null, enabled = true) {
  return useQuery({
    queryKey: [INDEXED_DEBATE_QUERY_KEY, versusId],
    queryFn: ({ signal }) => jsonResponse<Debate>(`/api/versus/${encodeURIComponent(versusId)}`, signal),
    initialData: initialData ?? undefined,
    enabled: enabled && /^\d{1,78}$/.test(versusId),
    staleTime: 5_000,
    refetchInterval: enabled ? DETAIL_REFRESH_MS : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}
