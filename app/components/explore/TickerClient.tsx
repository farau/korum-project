"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Debate } from "../../lib/debates";
import { useMock } from "../MockProvider";

type TickerAction = "buys" | "sells";

type TickerTx = {
  id: string;
  who: string;
  action: TickerAction;
  amount: number;
  symbol: string;
  fresh: boolean;
};

const names = ["Ines", "Marco", "Yasmine", "Sam", "Rayan", "Lina", "Nina", "Léo"];

function symbolOf(name: string) {
  return `$${name.replace(/[^a-z0-9]/gi, "").slice(0, 5).toUpperCase()}`;
}

function buildTx(debates: Debate[], index: number, fresh = false): TickerTx {
  const debate = debates[index % debates.length];
  const action: TickerAction = index % 3 === 0 ? "sells" : "buys";
  const token = index % 2 === 0 ? debate.tokenA : debate.tokenB;
  const side = token?.name || (index % 2 === 0 ? debate.sideA : debate.sideB);
  return {
    id: fresh ? `live-${Date.now()}-${index}-${action}-${side}` : `seed-${index}-${action}-${side}`,
    who: names[index % names.length],
    action,
    amount: 100 + (((debate.holderCount ?? debate.participantCount ?? 0) + index * 17) % 210),
    symbol: token?.symbol || symbolOf(side),
    fresh,
  };
}

export default function TickerClient({ debates }: { debates: Debate[] }) {
  const { mockEnabled } = useMock();
  const initialItems = useMemo(() => {
    if (!debates.length) return [];
    return Array.from({ length: 10 }, (_, index) => buildTx(debates, index, false));
  }, [debates]);
  const [items, setItems] = useState<TickerTx[]>(initialItems);

  useEffect(() => {
    const timer = window.setTimeout(() => setItems(initialItems), 0);
    return () => window.clearTimeout(timer);
  }, [initialItems]);

  useEffect(() => {
    if (!mockEnabled || !debates.length) return;
    let cursor = initialItems.length;
    const timer = window.setInterval(() => {
      setItems((current) => [buildTx(debates, cursor, true), ...current.map((item) => ({ ...item, fresh: false }))].slice(0, 16));
      cursor += 1;
    }, 2400);

    return () => window.clearInterval(timer);
  }, [debates, initialItems.length, mockEnabled]);

  if (!mockEnabled) return null;

  return (
    <div className="ticker live-ticker" aria-label="Recent activity">
      <div className="ticker-inner" role="list" aria-live="polite">
        {items.map((item) => (
          <span
            key={item.id}
            className={`ticker-item ${item.fresh ? "live-new" : ""} ${item.action === "buys" ? "buy-tx" : "sell-tx"}`}
            role="listitem"
          >
            <Link href="/explore">
              <span className="who">{item.who}</span>
              <span className={`act ${item.action === "buys" ? "buy" : "sell"}`}>{item.action}</span>
              <span>${item.amount} of</span>
              <span className="side">{item.symbol}</span>
            </Link>
          </span>
        ))}
      </div>
    </div>
  );
}
