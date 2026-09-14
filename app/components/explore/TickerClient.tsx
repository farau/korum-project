"use client";

import { useQuery } from "@tanstack/react-query";
import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import type { Debate } from "../../lib/debates";
import { RECENT_MARKET_TRADES_QUERY_KEY } from "../../hooks/useIndexedMarkets";
import { formatMarketValue } from "../../lib/markets/format";
import { useMock } from "../MockProvider";

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

const names = ["Ines", "Marco", "Yasmine", "Sam", "Rayan", "Lina", "Nina", "Léo"];
const LIVE_FEED_LIMIT = 50;
const LIVE_FEED_REFRESH_MS = 5_000;
const REVEAL_INTERVAL_MS = 1_100;

function symbolOf(name: string) {
  return `$${name.replace(/[^a-z0-9]/gi, "").slice(0, 5).toUpperCase()}`;
}

function symbolLabel(symbol: string) {
  return symbol.startsWith("$") ? symbol : `$${symbol}`;
}

function shortWallet(address: string) {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

function buildMockTx(debates: Debate[], index: number, fresh = false): TickerTx {
  const debate = debates[index % debates.length];
  const action: TickerAction = index % 3 === 0 ? "sells" : "buys";
  const token = index % 2 === 0 ? debate.tokenA : debate.tokenB;
  const side = token?.name || (index % 2 === 0 ? debate.sideA : debate.sideB);
  return {
    id: fresh ? `mock-live-${Date.now()}-${index}-${action}-${side}` : `mock-seed-${index}-${action}-${side}`,
    who: names[index % names.length],
    action,
    amountLabel: `$${100 + (((debate.holderCount ?? debate.participantCount ?? 0) + index * 17) % 210)}`,
    symbol: token?.symbol || symbolOf(side),
    href: `/vs/${debate.id}`,
    fresh,
  };
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

export default function TickerClient({ debates }: { debates: Debate[] }) {
  const { mockEnabled } = useMock();
  const initialMockItems = useMemo(() => {
    if (!debates.length) return [];
    return Array.from({ length: 10 }, (_, index) => buildMockTx(debates, index, false));
  }, [debates]);
  const [items, setItems] = useState<TickerTx[]>(mockEnabled ? initialMockItems : []);
  const seenLiveIds = useRef(new Set<string>());
  const pendingLiveItems = useRef<TickerTx[]>([]);
  const liveInitialized = useRef(false);
  const liveFeed = useQuery({
    queryKey: [RECENT_MARKET_TRADES_QUERY_KEY, LIVE_FEED_LIMIT],
    queryFn: async () => {
      const response = await fetch(`/api/markets/trades?limit=${LIVE_FEED_LIMIT}`);
      if (!response.ok) throw new Error("Unable to refresh recent market activity.");
      return response.json() as Promise<IndexedFeedResponse>;
    },
    enabled: !mockEnabled,
    refetchInterval: mockEnabled ? false : LIVE_FEED_REFRESH_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  useEffect(() => {
    seenLiveIds.current.clear();
    pendingLiveItems.current = [];
    liveInitialized.current = false;
    const timer = window.setTimeout(() => setItems(mockEnabled ? initialMockItems : []), 0);
    return () => window.clearTimeout(timer);
  }, [initialMockItems, mockEnabled]);

  useEffect(() => {
    if (mockEnabled || !liveFeed.data) return;
    const mapped = liveFeed.data.trades.map((trade) => buildIndexedTx(trade, liveFeed.data.quoteUsd, false));

    if (!liveInitialized.current) {
      mapped.forEach((item) => seenLiveIds.current.add(item.id));
      liveInitialized.current = true;
      const timer = window.setTimeout(() => setItems(mapped.slice(0, 16)), 0);
      return () => window.clearTimeout(timer);
    }

    const unseen = mapped.filter((item) => !seenLiveIds.current.has(item.id));
    unseen.forEach((item) => seenLiveIds.current.add(item.id));
    pendingLiveItems.current.push(...unseen.reverse().map((item) => ({ ...item, fresh: true })));
    if (pendingLiveItems.current.length > 100) {
      pendingLiveItems.current.splice(0, pendingLiveItems.current.length - 100);
    }
  }, [liveFeed.data, mockEnabled]);

  useEffect(() => {
    if (mockEnabled) return;
    const timer = window.setInterval(() => {
      const next = pendingLiveItems.current.shift();
      if (!next) return;
      setItems((current) => [next, ...current.map((item) => ({ ...item, fresh: false }))].slice(0, 16));
    }, REVEAL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [mockEnabled]);

  useEffect(() => {
    if (!mockEnabled || !debates.length) return;
    let cursor = initialMockItems.length;
    const timer = window.setInterval(() => {
      setItems((current) => [buildMockTx(debates, cursor, true), ...current.map((item) => ({ ...item, fresh: false }))].slice(0, 16));
      cursor += 1;
    }, 2_400);
    return () => window.clearInterval(timer);
  }, [debates, initialMockItems.length, mockEnabled]);

  if (!items.length) return null;

  return (
    <div className="ticker live-ticker" aria-label="Recent market activity">
      <div className="ticker-inner" role="list" aria-live="polite" aria-atomic="false">
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
      </div>
    </div>
  );
}
