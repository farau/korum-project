"use client";

import { useQuery } from "@tanstack/react-query";

import type { Debate } from "../lib/debates";

export const INDEXED_DEBATES_QUERY_KEY = ["indexed-debates"] as const;
export const INDEXED_DEBATE_QUERY_KEY = "indexed-debate";
export const TOKEN_CHART_QUERY_KEY = "token-chart";
export const TOKEN_TRADES_QUERY_KEY = "token-trades";
export const RECENT_MARKET_TRADES_QUERY_KEY = "recent-market-trades";

const DEBATES_REFRESH_MS = 15_000;
const DETAIL_REFRESH_MS = 15_000;

async function jsonResponse<T>(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to refresh indexed market data (${response.status}).`);
  return response.json() as Promise<T>;
}

export function useIndexedDebates(initialData?: Debate[], enabled = true) {
  return useQuery({
    queryKey: INDEXED_DEBATES_QUERY_KEY,
    queryFn: () => jsonResponse<Debate[]>("/api/debates"),
    initialData,
    enabled,
    staleTime: 5_000,
    refetchInterval: enabled ? DEBATES_REFRESH_MS : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}

export function useIndexedDebate(versusId: string, initialData: Debate | null, enabled = true) {
  return useQuery({
    queryKey: [INDEXED_DEBATE_QUERY_KEY, versusId],
    queryFn: () => jsonResponse<Debate>(`/api/debates/${encodeURIComponent(versusId)}`),
    initialData: initialData ?? undefined,
    enabled: enabled && /^\d{1,78}$/.test(versusId),
    staleTime: 5_000,
    refetchInterval: enabled ? DETAIL_REFRESH_MS : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}
