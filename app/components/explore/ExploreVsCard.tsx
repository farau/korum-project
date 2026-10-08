"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import type { Debate, DebateToken } from "../../lib/debates";
import { formatMarketValue } from "../../lib/markets/format";
import { useWatchlist } from "../../hooks/useWatchlist";
import ProfileAvatar from "../ProfileAvatar";
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
  const creator = debate.creatorName || (debate.creatorAddress ? `${debate.creatorAddress.slice(0, 6)}…${debate.creatorAddress.slice(-4)}` : "Unknown");
  const href = `/vs/${debate.id}`;

  return (
    <article className={styles.card}>
      <div className={styles.header}>
        <span className={styles.category}>{debate.category}</span>
        <span className={styles.age}>{age}</span>
      </div>
      <Link href={href} className={styles.visuals} aria-label={`${tokens[0].name} vs ${tokens[1].name}`}>
        {tokens.map((token, side) => {
          const source = token.image || token.imageRef;
          return (
            <div className={styles.token} key={side}>
              {source && !failedImages.includes(source) ? (
                <Image src={source} alt={token.name} fill unoptimized
                  sizes="(max-width: 600px) 45vw, (max-width: 1100px) 23vw, 16vw"
                  loading={index === 0 ? "eager" : "lazy"}
                  onError={() => setFailedImages((images) => [...images, source])} />
              ) : <span className={styles.initial}>{token.name.charAt(0).toUpperCase()}</span>}
              <span className={styles.tokenName}>{token.name}</span>
            </div>
          );
        })}
        <span className={styles.vs}>VS</span>
      </Link>
      <div className={styles.body}>
        <div className={styles.creator}>
          <ProfileAvatar address={debate.creatorAddress || ""} className={styles.avatar} />
          <span>by <span className={styles.creatorName}>{creator}</span></span>
        </div>
        <div className={styles.values}>
          {tokens.map((token, side) => {
            const change = token.change24h ?? 0;
            return <div className={styles.value} key={side}>
              <span className={styles.price}>{formatMarketValue(token.marketCap ?? 0, currency, 1)}</span>
              <span className={change >= 0 ? styles.up : styles.down}>{change >= 0 ? "+" : ""}{change.toFixed(1)}%</span>
            </div>;
          })}
        </div>
        <div className={styles.meterRow}>
          <span>{share}%</span>
          <div className={styles.meter} role="img" aria-label={`${tokens[0].name} ${share}%, ${tokens[1].name} ${100 - share}%`}>
            <span style={{ width: `${Math.max(share, 100 - share)}%`, marginLeft: 0 }} />
          </div>
          <span>{100 - share}%</span>
        </div>
        <div className={styles.stats}>
          <div className={styles.stat}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 13h4v8H3zM10 8h4v13h-4zM17 3h4v18h-4z" /></svg>
            <span><span className={styles.label}>Mkt Cap</span><strong>{formatMarketValue(totalCap, currency, 1)}</strong></span>
          </div>
          <div className={styles.stat}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="4" /><path d="M2 21v-2a7 7 0 0 1 14 0v2H2ZM16 4a4 4 0 0 1 0 8M18 15a6 6 0 0 1 4 6h-3" /></svg>
            <span><span className={styles.label}>Holders</span><strong>{debate.holderCount?.toLocaleString("en-US") ?? "—"}</strong></span>
          </div>
          <div className={styles.stat}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m2 18 7-8 5 5 8-12M16 3h6v6" /></svg>
            <span><span className={styles.label}>24h Vol</span><strong>{formatMarketValue(debate.volume24h, currency, 1)}</strong></span>
          </div>
          <button type="button" className={styles.watchlist} aria-label={starred ? "Remove from watchlist" : "Add to watchlist"} aria-pressed={starred} onClick={() => toggle(debate.id, `${debate.sideA} vs ${debate.sideB}`)}>
            <svg viewBox="0 0 24 24" fill={starred ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="m12 3 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.6l6.2-.9L12 3Z" /></svg>
          </button>
        </div>
        <Link href={href} className={styles.cta}>
          <span className={styles.arrow}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg></span>
          <span>View versus</span>
        </Link>
      </div>
    </article>
  );
}
