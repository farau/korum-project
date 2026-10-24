"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "../components/WalletProvider";
import { DEPLOYMENT_CACHE_SCOPE } from "../config/deployment";
import { pushAppNotification } from "../lib/notifications/client";
import { WatchlistSession } from "../lib/watchlist/client";

const WATCHLIST_CHANNEL = "korum-watchlist";
const EMPTY_IDS: number[] = [];
type WatchlistContextValue = {
  ids: number[]; ready: boolean; error: Error | null; pending: boolean;
  session: WatchlistSession | null;
};
const WatchlistContext = createContext<WatchlistContextValue | null>(null);

function WalletWatchlist({ address, children }: { address: string; children: ReactNode }) {
  const client = useQueryClient();
  const [pending, setPending] = useState(false);
  const [session] = useState(() => new WatchlistSession(client, DEPLOYMENT_CACHE_SCOPE, address, setPending,
    (id, label, added) => {
      const versus = label || `Versus #${id}`;
      pushAppNotification(address, {
        type: "watchlist", title: added ? "Added to watchlist" : "Removed from watchlist",
        message: added ? `${versus} is now in your watchlist.` : `${versus} was removed from your watchlist.`,
      });
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel(WATCHLIST_CHANNEL);
        channel.postMessage({ scope: DEPLOYMENT_CACHE_SCOPE, address });
        channel.close();
      }
    }));
  useEffect(() => {
    session.activate();
    return () => session.dispose();
  }, [session]);
  const query = useQuery({ ...session.idsOptions(), enabled: !pending });
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(WATCHLIST_CHANNEL);
    channel.onmessage = event => {
      if (event.data?.scope === DEPLOYMENT_CACHE_SCOPE && event.data?.address === address) void session.refresh();
    };
    return () => channel.close();
  }, [address, session]);
  return <WatchlistContext.Provider value={{ session, pending, ids: query.data ?? EMPTY_IDS,
    ready: !query.isPending, error: query.error }}>{children}</WatchlistContext.Provider>;
}

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const { address, authenticated, hydrated } = useWallet();
  if (!hydrated || !authenticated || !address) {
    return <WatchlistContext.Provider value={{ session: null, ids: EMPTY_IDS, ready: hydrated, pending: false, error: null }}>
      {children}
    </WatchlistContext.Provider>;
  }
  return <WalletWatchlist key={address.toLowerCase()} address={address.toLowerCase()}>{children}</WalletWatchlist>;
}

export function useWatchlist() {
  const context = useContext(WatchlistContext);
  const { connect } = useWallet();
  if (!context) throw new Error("useWatchlist must be used within WatchlistProvider");
  const { ids, ready, error, pending, session } = context;
  const mutate = (id: number, label: string | undefined, operation: "add" | "remove" | "toggle") => {
    if (!session) { connect(); return Promise.resolve(false); }
    return session.mutate(id, label, operation);
  };
  return { ids, ready, error, pending,
    add: (id: number, label?: string) => mutate(id, label, "add"),
    remove: (id: number, label?: string) => mutate(id, label, "remove"),
    toggle: (id: number, label?: string) => mutate(id, label, "toggle"),
    has: (id: number) => ids.includes(id), refresh: () => session?.refresh(),
  };
}

// Only the Watchlist page needs full market objects and foreground polling.
export function useWatchlistDebates() {
  const context = useContext(WatchlistContext);
  if (!context) throw new Error("useWatchlistDebates must be used within WatchlistProvider");
  const { session, pending } = context;
  const query = useQuery({
    ...(session?.detailsOptions() ?? { queryKey: ["watchlist", "anonymous", "details"], queryFn: async () => ({ ids: [], debates: [] }) }),
    enabled: Boolean(session) && !pending,
    refetchInterval: 15_000, refetchIntervalInBackground: false,
  });
  return { debates: session ? query.data?.debates ?? [] : [],
    ready: context.ready && (!session || !query.isPending), error: context.error ?? query.error };
}
