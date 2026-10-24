"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DEPLOYMENT_CACHE_SCOPE } from "../config/deployment";
import { useWallet } from "../components/WalletProvider";
import { fetchPendingReferral } from "../lib/referrals/client";
import type { PendingReferral } from "../lib/referrals/pending";

export function usePendingReferral(initial: PendingReferral | null = null) {
  const { address, authenticated } = useWallet();
  const client = useQueryClient();
  const wallet = authenticated ? address?.toLowerCase() : null;
  const key = ["pending-referral", DEPLOYMENT_CACHE_SCOPE, wallet] as const;
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => fetchPendingReferral(wallet!, signal),
    enabled: Boolean(wallet),
    initialData: wallet && initial?.walletAddress.toLowerCase() === wallet ? initial : undefined,
    staleTime: 60_000,
    gcTime: 0,
    retry: false,
  });
  const referral = wallet && query.data?.walletAddress.toLowerCase() === wallet ? query.data : null;
  const clear = useCallback(async () => {
    if (!wallet) return;
    const key = ["pending-referral", DEPLOYMENT_CACHE_SCOPE, wallet];
    await client.cancelQueries({ queryKey: key, exact: true });
    client.setQueryData(key, null);
  }, [client, wallet]);
  return { referral, clear };
}
