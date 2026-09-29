"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "../components/WalletProvider";
import { fetchPendingReferral } from "../lib/referrals/client";
import type { PendingReferral } from "../lib/referrals/pending";

export function usePendingReferral(initial: PendingReferral | null = null) {
  const { address, authenticated } = useWallet();
  const [stored, setStored] = useState(initial);
  const wallet = authenticated ? address?.toLowerCase() : null;
  const referral = wallet && stored?.walletAddress.toLowerCase() === wallet ? stored : null;
  useEffect(() => {
    if (!wallet) return;
    const controller = new AbortController();
    void fetchPendingReferral(wallet, controller.signal).then(result => {
      if (!controller.signal.aborted) setStored(result);
    });
    return () => controller.abort();
  }, [wallet]);
  const clear = useCallback(() => setStored(null), []);
  return { referral, clear };
}
