"use client";

import { useQuery } from "@tanstack/react-query";
import { DEPLOYMENT_CACHE_SCOPE } from "../config/deployment";
import type { ProfileHoldings } from "../lib/profile-holdings";

export function useProfileHoldings(address: string | null, polling: boolean) {
  const wallet = address?.toLowerCase() ?? null;
  return useQuery({
    queryKey: ["profile-holdings", DEPLOYMENT_CACHE_SCOPE, wallet],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/profile/holdings", {
        credentials: "same-origin", cache: "no-store", signal,
        headers: { "X-Wallet-Address": wallet! },
      });
      if (!response.ok) throw new Error(`Holdings service returned ${response.status}.`);
      if (response.headers.get("X-Korum-Wallet")?.toLowerCase() !== wallet) {
        throw new Error("The profile wallet changed.");
      }
      return response.json() as Promise<ProfileHoldings>;
    },
    enabled: Boolean(wallet),
    staleTime: 120_000,
    gcTime: 0,
    refetchInterval: wallet && polling ? 120_000 : false,
    refetchIntervalInBackground: false,
    retry: 1,
  });
}
