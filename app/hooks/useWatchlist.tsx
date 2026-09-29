"use client";

import { useCallback, useEffect, useState } from "react";

import { useWallet } from "../components/WalletProvider";
import type { Debate } from "../lib/debates";
import { pushAppNotification } from "../lib/notifications/client";

const WATCHLIST_CHANGE_EVENT = "korum:watchlist-change";
const WATCHLIST_CHANNEL = "korum-watchlist";

type WatchlistResponse = {
  ids?: unknown;
  debates?: unknown;
};

function validIds(value: unknown): value is number[] {
  return Array.isArray(value)
    && value.every((id) => Number.isSafeInteger(id) && Number(id) >= 0);
}

function validDebates(value: unknown): value is Debate[] {
  return Array.isArray(value) && value.every((debate) => {
    if (!debate || typeof debate !== "object") return false;
    const candidate = debate as Partial<Debate>;
    return Number.isSafeInteger(candidate.id)
      && typeof candidate.sideA === "string"
      && typeof candidate.sideB === "string"
      && typeof candidate.category === "string";
  });
}

function publishLocalWatchlist(ids: number[]) {
  window.dispatchEvent(new CustomEvent<number[]>(WATCHLIST_CHANGE_EVENT, { detail: ids }));
}

function notifyOtherTabs() {
  if (!("BroadcastChannel" in window)) return;
  const channel = new BroadcastChannel(WATCHLIST_CHANNEL);
  channel.postMessage("refresh");
  channel.close();
}

export function useWatchlist() {
  const { address, authenticated, connect, hydrated } = useWallet();
  const [ids, setIds] = useState<number[]>([]);
  const [debates, setDebates] = useState<Debate[]>([]);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    if (!hydrated) return;
    if (!authenticated || !address) {
      setIds([]);
      setDebates([]);
      setReady(true);
      return;
    }

    try {
      const response = await fetch("/api/watchlist", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error(`Unable to load watchlist (${response.status}).`);
      const result = await response.json() as WatchlistResponse;
      setIds(validIds(result.ids) ? result.ids : []);
      setDebates(validDebates(result.debates) ? result.debates : []);
    } catch {
      setIds([]);
      setDebates([]);
    } finally {
      setReady(true);
    }
  }, [address, authenticated, hydrated]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    function syncWatchlist(event: Event) {
      const next = (event as CustomEvent<unknown>).detail;
      if (validIds(next)) setIds(next);
    }

    window.addEventListener(WATCHLIST_CHANGE_EVENT, syncWatchlist);
    return () => window.removeEventListener(WATCHLIST_CHANGE_EVENT, syncWatchlist);
  }, []);

  useEffect(() => {
    if (!("BroadcastChannel" in window)) return;
    const channel = new BroadcastChannel(WATCHLIST_CHANNEL);
    channel.addEventListener("message", load);
    return () => {
      channel.removeEventListener("message", load);
      channel.close();
    };
  }, [load]);

  async function mutate(id: number, label: string | undefined, added: boolean) {
    if (!authenticated || !address) {
      connect();
      return false;
    }

    const previous = ids;
    const previousDebates = debates;
    const next = added ? [...ids, id] : ids.filter((currentId) => currentId !== id);
    setIds(next);
    if (!added) setDebates((currentDebates) => currentDebates.filter((debate) => debate.id !== id));
    publishLocalWatchlist(next);

    try {
      const response = await fetch("/api/watchlist", {
        method: added ? "POST" : "DELETE",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versusId: id }),
      });
      if (!response.ok) throw new Error(`Unable to update watchlist (${response.status}).`);

      const versus = label || `Versus #${id}`;
      pushAppNotification(address, {
        type: "watchlist",
        title: added ? "Added to watchlist" : "Removed from watchlist",
        message: added ? `${versus} is now in your watchlist.` : `${versus} was removed from your watchlist.`,
      });
      notifyOtherTabs();
      await load();
      return true;
    } catch {
      setIds(previous);
      setDebates(previousDebates);
      publishLocalWatchlist(previous);
      return false;
    }
  }

  function add(id: number, label?: string) {
    if (ids.includes(id)) return Promise.resolve(true);
    return mutate(id, label, true);
  }

  function remove(id: number, label?: string) {
    if (!ids.includes(id)) return Promise.resolve(true);
    return mutate(id, label, false);
  }

  function toggle(id: number, label?: string) {
    return mutate(id, label, !ids.includes(id));
  }

  function has(id: number) {
    return ids.includes(id);
  }

  return { ids, debates, ready, add, remove, toggle, has, refresh: load };
}
