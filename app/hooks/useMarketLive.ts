"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { INDEXED_DEBATES_QUERY_KEY, INDEXED_DEBATE_QUERY_KEY, TOKEN_CHART_QUERY_KEY, TOKEN_TRADES_QUERY_KEY, RECENT_MARKET_TRADES_QUERY_KEY } from "./useIndexedMarkets";
import type { MarketNotice } from "../lib/live/protocol";

// Shared by the ticker and both token panels: one connection per browser tab.
const interests = new Map<symbol, string>();
const listeners = new Set<() => void>();
let source: EventSource | null = null;
let connected = false;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let refreshAll = false;
const changedTokens = new Set<string>();
let refreshing = false;
let activeClient: QueryClient | undefined;

function setConnected(value: boolean) {
  if (connected === value) return;
  connected = value;
  listeners.forEach(listener => listener());
}
function scheduleRefresh(tokens: string[], reset = false) {
  tokens.forEach(token => changedTokens.add(token));
  refreshAll ||= reset;
  if (refreshTimer || refreshing) return;
  refreshTimer = setTimeout(async () => {
    refreshTimer = undefined;
    const all = refreshAll;
    const changed = new Set(changedTokens);
    refreshAll = false; changedTokens.clear(); refreshing = true;
    try {
      await activeClient?.invalidateQueries({ predicate: query => {
        const [kind, token] = query.queryKey;
        if (kind === TOKEN_CHART_QUERY_KEY || kind === TOKEN_TRADES_QUERY_KEY) return all || String(token).split(":").some(address => changed.has(address));
        return kind === RECENT_MARKET_TRADES_QUERY_KEY || kind === INDEXED_DEBATES_QUERY_KEY[0] || kind === INDEXED_DEBATE_QUERY_KEY;
      }, refetchType: "active" });
    } finally {
      refreshing = false;
      if (refreshAll || changedTokens.size) scheduleRefresh([]);
    }
  }, 250);
}
function reconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    source?.close(); source = null; setConnected(false);
    if (!interests.size || document.visibilityState === "hidden") return;
    const values = [...interests.values()];
    const params = new URLSearchParams();
    if (values.includes("feed")) params.set("feed", "1");
    const tokens = [...new Set(values.filter(value => value !== "feed"))].slice(0, 20);
    if (tokens.length) params.set("tokens", tokens.join(","));
    source = new EventSource(`/api/markets/live?${params}`);
    source.addEventListener("ready", () => { setConnected(true); scheduleRefresh([], true); });
    source.addEventListener("market", event => {
      try {
        const notice = JSON.parse((event as MessageEvent).data) as MarketNotice;
        if (!Array.isArray(notice.tokens) || notice.tokens.some(token => !/^0x[\da-f]{40}$/.test(token))) return;
        scheduleRefresh(notice.tokens, notice.reset);
      } catch { /* Polling remains the recovery path for malformed messages. */ }
    });
    source.onerror = () => {
      setConnected(false);
      source?.close(); source = null;
      // Some HTTP failures put EventSource in CLOSED instead of retrying.
      // Explicit retry also recovers when Redis/webhook configuration returns.
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (interests.size) reconnectTimer = setTimeout(reconnect, 5_000);
    };
  }, 50);
}
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function useMarketLive(token: string | null = "feed") {
  const queryClient = useQueryClient();
  const live = useSyncExternalStore(subscribe, () => connected, () => false);
  useEffect(() => {
    if (!token || typeof EventSource === "undefined") return;
    const key = Symbol();
    activeClient = queryClient;
    interests.set(key, token);
    if (interests.size === 1) document.addEventListener("visibilitychange", reconnect);
    reconnect();
    return () => {
      interests.delete(key);
      if (!interests.size) {
        document.removeEventListener("visibilitychange", reconnect);
        if (refreshTimer) clearTimeout(refreshTimer);
        refreshTimer = undefined; refreshAll = false; changedTokens.clear();
      }
      reconnect();
    };
  }, [queryClient, token]);
  return live;
}
