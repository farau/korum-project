"use client";

import { useQuery } from "@tanstack/react-query";
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import HorizontalRail from "./HorizontalRail";
import { useMarketLive } from "../../hooks/useMarketLive";

import { RECENT_MARKET_TRADES_QUERY_KEY } from "../../hooks/useIndexedMarkets";
import { formatMarketValue } from "../../lib/markets/format";

type TickerAction = "buys" | "sells";

type TickerTx = {
  id: string;
  who: string;
  action: TickerAction;
  amountLabel: string;
  symbol: string;
  href: string;
  fresh: boolean;
};

type IndexedFeedTrade = {
  id: string;
  versusId: string;
  side: "buy" | "sell";
  quoteAmount: string;
  account: string;
  tokenSymbol: string;
};

type IndexedFeedResponse = {
  trades: IndexedFeedTrade[];
  quoteUsd: number | null;
};

const LIVE_FEED_LIMIT = 50;
const LIVE_FEED_REFRESH_MS = 5_000;
const REVEAL_INTERVAL_MS = 150;

function symbolLabel(symbol: string) {
  return symbol.startsWith("$") ? symbol : `$${symbol}`;
}

function shortWallet(address: string) {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

function buildIndexedTx(trade: IndexedFeedTrade, quoteUsd: number | null, fresh: boolean): TickerTx {
  const quoteEth = Number(trade.quoteAmount);
  const amountLabel = Number.isFinite(quoteEth) && quoteUsd !== null
    ? formatMarketValue(quoteEth * quoteUsd, "USD", 2)
    : formatMarketValue(quoteEth, "ETH", 5);

  return {
    id: trade.id,
    who: shortWallet(trade.account),
    action: trade.side === "buy" ? "buys" : "sells",
    amountLabel,
    symbol: symbolLabel(trade.tokenSymbol),
    href: `/vs/${trade.versusId}`,
    fresh,
  };
}

export default function TickerClient() {
  const live = useMarketLive();
  const [items, setItems] = useState<TickerTx[]>([]);
  const seenLiveIds = useRef(new Set<string>());
  const pendingLiveItems = useRef<TickerTx[]>([]);
  const liveInitialized = useRef(false);
  const liveFeed = useQuery({
    queryKey: [RECENT_MARKET_TRADES_QUERY_KEY, LIVE_FEED_LIMIT],
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/markets/trades?limit=${LIVE_FEED_LIMIT}`, { signal, cache: "no-store" });
      if (!response.ok) throw new Error("Unable to refresh recent market activity.");
      return response.json() as Promise<IndexedFeedResponse>;
    },
    refetchInterval: live ? 30_000 : LIVE_FEED_REFRESH_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  useEffect(() => {
    if (!liveFeed.data) return;
    const mapped = liveFeed.data.trades.map((trade) => buildIndexedTx(trade, liveFeed.data.quoteUsd, false));

    if (!liveInitialized.current) {
      mapped.forEach((item) => seenLiveIds.current.add(item.id));
      liveInitialized.current = true;
      const timer = window.setTimeout(() => setItems(mapped.slice(0, 16)), 0);
      return () => window.clearTimeout(timer);
    }

    const latest = new Map(mapped.map(item => [item.id, item]));
    pendingLiveItems.current = pendingLiveItems.current.filter(item => latest.has(item.id));
    for (const id of seenLiveIds.current) if (!latest.has(id)) seenLiveIds.current.delete(id);
    // Remove reorged trades and refresh corrected labels already on screen.
    const reconcile = window.setTimeout(() => setItems(current => current.filter(item => latest.has(item.id)).map(item => latest.get(item.id)!)), 0);
    const unseen = mapped.filter((item) => !seenLiveIds.current.has(item.id));
    unseen.forEach((item) => seenLiveIds.current.add(item.id));
    pendingLiveItems.current.push(...unseen.reverse().map((item) => ({ ...item, fresh: true })));
    if (pendingLiveItems.current.length > 100) {
      pendingLiveItems.current.splice(0, pendingLiveItems.current.length - 100);
    }
    if (seenLiveIds.current.size > 500) seenLiveIds.current = new Set([...mapped.map(item => item.id), ...pendingLiveItems.current.map(item => item.id)]);
    return () => window.clearTimeout(reconcile);
  }, [liveFeed.data]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = pendingLiveItems.current.splice(0, Math.max(1, Math.ceil(pendingLiveItems.current.length / 8)));
      if (!next.length) return;
      setItems((current) => [...next.reverse(), ...current.map((item) => ({ ...item, fresh: false }))].slice(0, 16));
    }, REVEAL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  if (!items.length) return null;

  return (
    <HorizontalRail className="ticker live-ticker" viewportClassName="ticker-inner" label="Recent market activity" list>
        {items.map((item) => (
          <span
            key={item.id}
            className={`ticker-item ${item.fresh ? "live-new" : ""} ${item.action === "buys" ? "buy-tx" : "sell-tx"}`}
            role="listitem"
          >
            <Link href={item.href}>
              <span className="who">{item.who}</span>
              <span className={`act ${item.action === "buys" ? "buy" : "sell"}`}>{item.action}</span>
              <span>{item.amountLabel} of</span>
              <span className="side">{item.symbol}</span>
            </Link>
          </span>
        ))}
    </HorizontalRail>
  );
}
