"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import type { Debate, DebateToken } from "../../lib/debates";
import { formatMarketValue } from "../../lib/markets/format";
import { useWatchlist } from "../../hooks/useWatchlist";
import MarketStatIcon from "../MarketStatIcon";
import styles from "./ExploreVsCard.module.css";

function fmtAgeFromMinutes(minutes: number) {
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h ago`;
  return `${Math.round(minutes / 1440)}d ago`;
}

function timestampMs(value?: string | number) {
  if (typeof value === "number") return value < 10_000_000_000 ? value * 1000 : value;
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function relativeAge(timestamp: number | undefined, now: number | null, fallbackMinutes: number) {
  if (!timestamp || !now) return fmtAgeFromMinutes(fallbackMinutes);
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
  return fmtAgeFromMinutes(minutes);
}

function tokenSymbol(name: string) {
  return `$${name.replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase()}`;
}

function getTokenA(debate: Debate): DebateToken {
  return {
    ...debate.tokenA,
    name: debate.tokenA?.name || debate.sideA,
    symbol: debate.tokenA?.symbol || debate.tokenASymbol || tokenSymbol(debate.sideA),
    image: debate.tokenA?.image || debate.imageA,
    imageRef: debate.tokenA?.imageRef || debate.imageRefA,
    marketCap: debate.tokenA?.marketCap ?? debate.marketCapA,
    change24h: debate.tokenA?.change24h ?? debate.changeA24h,
    launchedAt: debate.tokenA?.launchedAtUtc || debate.tokenA?.launchedAt,
    launchTimestamp: debate.tokenA?.launchTimestamp ?? debate.tokenA?.createdAtTimestamp,
  };
}

function getTokenB(debate: Debate): DebateToken {
  return {
    ...debate.tokenB,
    name: debate.tokenB?.name || debate.sideB,
    symbol: debate.tokenB?.symbol || debate.tokenBSymbol || tokenSymbol(debate.sideB),
    image: debate.tokenB?.image || debate.imageB,
    imageRef: debate.tokenB?.imageRef || debate.imageRefB,
    marketCap: debate.tokenB?.marketCap ?? debate.marketCapB,
    change24h: debate.tokenB?.change24h ?? debate.changeB24h,
    launchedAt: debate.tokenB?.launchedAtUtc || debate.tokenB?.launchedAt,
    launchTimestamp: debate.tokenB?.launchTimestamp ?? debate.tokenB?.createdAtTimestamp,
  };
}

export default function ExploreVsCard({ debate, index = 0 }: { debate: Debate; index?: number }) {
  const tokens = [getTokenA(debate), getTokenB(debate)];
  const currency = debate.marketCurrency ?? "USD";
  const totalCap = (tokens[0].marketCap ?? 0) + (tokens[1].marketCap ?? 0);
  const share = Math.max(0, Math.min(100, totalCap > 0
    ? Math.round(((tokens[0].marketCap ?? 0) / totalCap) * 100)
    : debate.sideAPercentage ?? 50));
  const visualSplit = share === 50 ? 50
    : 50 + Math.sign(share - 50) * (4 + Math.min(Math.abs(share - 50) * 0.16, 8));
  const { toggle, has } = useWatchlist();
  const starred = has(debate.id);
  const [failedImages, setFailedImages] = React.useState<string[]>([]);
  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => {
    const kickoff = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => { window.clearTimeout(kickoff); window.clearInterval(timer); };
  }, []);
  const debateTimestamp = timestampMs(debate.launchedAtUtc || debate.launchedAt || debate.createdAtUtc || debate.createdAt)
    ?? timestampMs(debate.launchTimestamp ?? debate.createdAtTimestamp);
  const launchTimestamp = Math.max(...tokens.map((token) => timestampMs(token.launchedAt) ?? timestampMs(token.launchTimestamp) ?? debateTimestamp ?? 0)) || debateTimestamp;
  const age = relativeAge(launchTimestamp, now, debate.createdMinutesAgo);
  const href = `/vs/${debate.id}`;

  return (
    <article className={styles.card}>
      <div className={styles.meterRow}>
        <span>{share}%</span>
        <div className={styles.meter} data-majority={share >= 50 ? "a" : "b"} data-tied={share === 50}
          style={{ "--power-speed": `${0.65 - Math.abs(share - 50) * 0.007}s` } as React.CSSProperties}
          role="img" aria-label={`${tokens[0].name} ${share}%, ${tokens[1].name} ${100 - share}%`}>
          <span style={{ width: `${share}%` }} />
          <span style={{ width: `${100 - share}%` }} />
        </div>
        <span>{100 - share}%</span>
      </div>
      <div className={styles.header}>
        <span className={styles.category}>{debate.category}</span>
        <div className={styles.headerMeta}>
          <span className={styles.age}>{age}</span>
          <button type="button" className={styles.watchlist} aria-label={starred ? "Remove from watchlist" : "Add to watchlist"} aria-pressed={starred} onClick={() => toggle(debate.id, `${debate.sideA} vs ${debate.sideB}`)}>
            <svg viewBox="0 0 24 24" fill={starred ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="m12 3 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.6l6.2-.9L12 3Z" /></svg>
          </button>
        </div>
      </div>
      <Link href={href} className={styles.visuals}
        style={{ "--visual-split": `${visualSplit}%` } as React.CSSProperties}
        aria-label={`${tokens[0].name} vs ${tokens[1].name}`}>
        {tokens.map((token, side) => {
          const source = token.image || token.imageRef;
          return (
            <div className={styles.token} key={side}
              data-emphasis={share === 50 ? "balanced" : (side === 0 ? share > 50 : share < 50) ? "dominant" : "secondary"}>
              <div className={styles.tokenArtwork}>
                {source && !failedImages.includes(source) ? (
                  <Image src={source} alt={token.name} fill unoptimized
                    sizes="(max-width: 600px) 45vw, (max-width: 1100px) 23vw, 16vw"
                    loading={index === 0 ? "eager" : "lazy"}
                    onError={() => setFailedImages((images) => [...images, source])} />
                ) : <span className={styles.initial}>{token.name.charAt(0).toUpperCase()}</span>}
              </div>
            </div>
          );
        })}
        <span className={styles.vs}>VS</span>
      </Link>
      <div className={styles.body}>
        <Link href={href} className={styles.names}>
          <strong>{tokens[0].name}</strong><span>vs</span><strong>{tokens[1].name}</strong>
        </Link>
        <div className={styles.stats}>
          {tokens.map((token, side) => (
            <div className={styles.tokenStats} role="group" aria-label={`${token.name} statistics`} key={side}>
              <div className={styles.stat}>
                <MarketStatIcon kind="market" />
                <span><span className={styles.label}>MCAP</span><strong title={token.marketCap === undefined ? undefined : `${token.marketCap.toLocaleString("en-US")} ${currency}`}>{formatMarketValue(token.marketCap, currency, 1)}</strong></span>
              </div>
              <div className={styles.stat}>
                <MarketStatIcon kind="people" />
                <span><span className={styles.label}>Holders</span><strong title={token.holders?.toLocaleString("en-US")}>{token.holders === undefined ? "—" : Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(token.holders)}</strong></span>
              </div>
            </div>
          ))}
        </div>
        <Link href={href} className={styles.cta}>
          <span>View versus</span>
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m14 2-11 12h8l-1 8 11-12h-8l1-8Z" /></svg>
        </Link>
      </div>
    </article>
  );
}
