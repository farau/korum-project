"use client";

import { useQuery } from "@tanstack/react-query";
import type { UserProfileStats } from "../lib/profile";
import { PROFILE_STATS_QUERY_KEY } from "./useIndexedMarkets";
import { useMarketConnection, useMarketSubscription } from "./useMarketLive";

export function useProfileStats(address: string | null, initialData: UserProfileStats | null) {
  const live = useMarketConnection();
  const query = useQuery({
    queryKey: [PROFILE_STATS_QUERY_KEY, address?.toLowerCase()],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/profile/stats", { signal, credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error(`Unable to refresh profile statistics (${response.status}).`);
      const result = await response.json() as { address: string; stats: UserProfileStats };
      if (result.address.toLowerCase() !== address?.toLowerCase()) throw new Error("The profile wallet changed.");
      return result.stats;
    },
    initialData: address ? initialData ?? undefined : undefined,
    enabled: Boolean(address),
    staleTime: 60_000,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    // Live notices drive updates; a slow fallback recovers when SSE is unavailable.
    refetchInterval: address && !live ? 60_000 : false,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  const tokens = query.data?.liveTokens ?? initialData?.liveTokens ?? [];
  useMarketSubscription(address ? `profile:${address.toLowerCase()}:${[...tokens].sort().join(",")}` : null);
  return query;
}
