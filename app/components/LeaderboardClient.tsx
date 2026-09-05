"use client";

import Link from "next/link";
import React, { useMemo, useState } from "react";
import { shortenAddress, useWallet } from "./WalletProvider";

type Category = "traders" | "creators" | "referrers";
type Period = "today" | "week" | "month" | "all";
type SortMetric = "pnl" | "volume";

type DebateSummary = {
  id: number;
  sideA: string;
  sideB: string;
};

type LeaderboardRow = {
  name: string;
  pnl: number;
  volume: number;
  secondary: number;
};

type BigWin = {
  name: string;
  matchup: string;
  id: number;
  gain: number;
  volume: number;
};

const NAMES = [
  "degen_king_44", "0x34dS...532G4", "Thomasii_1999", "Nadia.K", "cX_visiteur_Xx",
  "LunaTrades", "SatoshiJr", "wagmi_wallet", "HotTakeHQ", "DebatLord", "0x9fA2...11Bc",
  "VersusVic", "MemeSenpai", "FrenchFries_on", "Camille_trades", "KingKarim", "aya.eth",
  "ZoeGoesLong", "the_strategist", "0x77bE...90Fd", "BullMarketBae", "TheOracle_",
  "WeekendBettor", "Yanis_vs_all", "CaffeineAndCrypto", "TheBigBet", "MissMarket",
  "0xBd12...44Ca", "UncleDegen", "NightOwlTrader", "RiskItAll", "Salome.exe",
  "TheVisionary", "0x5eF9...caB1", "JulesTheOdds", "BothSides", "ProfitProphet",
  "Inès_onchain", "MaximeGains", "0x21aC...7f0E", "QuorumQueen",
];

const CATEGORY_LABELS: Record<Category, string> = {
  traders: "traders",
  creators: "creators",
  referrers: "referrers",
};

const SECONDARY_LABELS: Record<Category, string> = {
  traders: "Win rate",
  creators: "VS created",
  referrers: "Referrals",
};

const PERIOD_SCALE: Record<Period, number> = {
  today: 0.12,
  week: 1,
  month: 3.6,
  all: 14,
};

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number) {
  let state = seed || 1;
  return () => {
    state = Math.imul(state ^ (state >>> 15), state | 1);
    state ^= state + Math.imul(state ^ (state >>> 7), state | 61);
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
  };
}

function normalize(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function compactMoney(value: number) {
  return `$${new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value)}`;
}

function generateLeaderboard(category: Category, period: Period, metric: SortMetric) {
  const scale = PERIOD_SCALE[period];
  const rows = NAMES.map((name) => {
    const random = seededRandom(hashText(`${category}:${period}:${name}`));
    const base = Math.pow(random(), 2.1) * 92_000 * scale + 400;
    const pnl = base * (0.35 + random() * 0.5);
    const volume = base * (2.2 + random() * 3.5);
    const secondary = category === "traders"
      ? Math.round(40 + random() * 45)
      : category === "creators"
        ? Math.round(1 + random() * 24)
        : Math.round(1 + random() * 38);

    return { name, pnl, volume, secondary };
  });

  return rows.sort((left, right) => right[metric] - left[metric]);
}

function generateBigWins(category: Category, period: Period, debates: DebateSummary[]) {
  if (debates.length === 0) return [];

  const scale = PERIOD_SCALE[period];
  return Array.from({ length: 10 }, (_, index): BigWin => {
    const random = seededRandom(hashText(`${category}:${period}:win:${index}`));
    const debate = debates[Math.floor(random() * Math.min(debates.length, 16))];
    const gain = Math.pow(random(), 1.8) * 38_000 * scale + 300;

    return {
      name: NAMES[Math.floor(random() * NAMES.length)],
      matchup: `${debate.sideA} vs ${debate.sideB}`,
      id: debate.id,
      gain,
      volume: gain * (1.3 + random() * 1.8),
    };
  }).sort((left, right) => right.gain - left.gain);
}

function tierForRank(rank: number) {
  if (rank === 1) return { label: "Champion", className: "champion" };
  if (rank <= 3) return { label: "Diamond", className: "diamond" };
  if (rank <= 8) return { label: "Gold", className: "gold" };
  if (rank <= 16) return { label: "Silver", className: "silver" };
  return { label: "Bronze", className: "bronze" };
}

function TierBadge({ rank }: { rank: number }) {
  const tier = tierForRank(rank);
  return <span className={`lb-tier-badge ${tier.className}`}>{tier.label}</span>;
}

function CrownIcon() {
  return (
    <svg viewBox="0 0 73.07 65.16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="lbCrownRainbow" x1="0" y1="0" x2="73.07" y2="65.16" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F2A6E4" />
          <stop offset="24%" stopColor="#E9B1DE" />
          <stop offset="47%" stopColor="#F2D98B" />
          <stop offset="68%" stopColor="#B9E978" />
          <stop offset="84%" stopColor="#79E873" />
          <stop offset="100%" stopColor="#2EDDB4" />
        </linearGradient>
      </defs>
      <g fill="url(#lbCrownRainbow)">
        <path d="M56.04,23.89c-3.97,3.67-6.83,12.13-8.86,12.39-7.31.95-6.22-14.22-8.69-21.38-4.31,7.87-7.1,16.28-9.02,25.09-.14.63-.57,1.24-.88,1.5-1.37,1.17-4.33-1.21-6.76-3.27l2.74,13.89c.21,1.06.38,2.66-.66,3.23-.8.43-1.76-.84-2.33-1.2-3.48-.42-6.64-1.75-9.96-3.11l2.19,6.71c-.83.75-2.31-.1-2.84-1.14l-4.64-9.06c1.53-.77,2.92-.1,4.25.51,3.44,1.59,6.67,3.48,10.62,4.27-2.06-6.35-4.04-12.38-3.82-18.91,2.93-2,5.52,1.66,8.59,4.95,2.29-9.74,5.15-19.15,10.64-27.52,1.07-1.64,3.79,0,4.39,1.4,2.76,6.39,3.37,12.86,4.75,19.89,3.01-5.07,7.33-13.24,11.44-12.32,3.72.83,3.66,8.68,2.72,13.43l-1.99,10.08c3.46-2.63,7.63-5.19,10.24-2.82,2.75,2.5-1.03,11.58-2.49,16.7-.62,2.16-1.66,3.82-4.32,3.55-7.89-.8-15.59-.6-23.49.4-7.92,1-15.47,2.14-23.22,3.98-.51.12-1.34-.54-1.45-.86-.65-1.91,20.93-5.47,27.13-6.08,6.84-.67,13.31-.29,20.3-.04,1.83-5.06,3.39-10.05,4.48-15.67-3.55,1.32-5.57,4.01-7.48,6.75-.92.7-2.02.69-2.83.26-5.08-2.67,2.77-17.36,1.22-25.63Z" />
        <path d="M5.79,43.79c-.77,1.62-2.84.86-3.85.24-1.16-.72-2.55-2.16-1.64-3.67.63-1.05,2.93-.55,3.73.21.7.67,2.3,2.08,1.76,3.22Z" />
        <path d="M72.66,34.89c-.7,1.4-1.59,1.83-2.82,1.46-1-.3-1.67-1.23-1.63-2.56.03-1.12.66-1.97,1.42-2.3.9-.39,1.99-.21,2.66.26.99.69.95,1.98.36,3.14Z" />
        <path d="M39.38,4.44c-.9.73-2.48-.04-3.11-.49-.79-.56-1.53-1.81-.96-3.05s2.63-1.03,3.85-.28c1.02.62,1.68,2.64.23,3.83Z" />
        <path d="M60.97,9.28c1.83,1.26.16,4.36-.45,4.58-.49.17-1.24.05-1.88-.46-1.07-.86-1.38-3.03-.51-4.23.68-.94,2.21-.33,2.84.1Z" />
        <path d="M17.4,27.87c-.71.77-2.15.19-2.76-.26-.7-.51-1.8-1.55-1.17-2.78.47-.92,2.26-.55,2.92.11.61.6,1.65,2.23,1.01,2.93Z" />
      </g>
    </svg>
  );
}

function RankingRow({ row, rank, category }: { row: LeaderboardRow; rank: number; category: Category }) {
  return (
    <div className="lb-row">
      <span className="lb-rank">#{rank}</span>
      <span className="lb-name">{row.name}<TierBadge rank={rank} /></span>
      <span className="lb-vol buy">+{compactMoney(row.pnl)}</span>
      <span className="lb-vol">{compactMoney(row.volume)}</span>
      <span className="lb-win">{category === "traders" ? `${row.secondary}%` : row.secondary}</span>
    </div>
  );
}

export default function LeaderboardClient({ debates }: { debates: DebateSummary[] }) {
  const [category, setCategory] = useState<Category>("traders");
  const [period, setPeriod] = useState<Period>("week");
  const [sortMetric, setSortMetric] = useState<SortMetric>("pnl");
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(12);
  const { address, connected, hydrated } = useWallet();

  const allRows = useMemo(
    () => generateLeaderboard(category, period, sortMetric),
    [category, period, sortMetric],
  );
  const normalizedSearch = normalize(search.trim());
  const filteredRows = useMemo(
    () => normalizedSearch
      ? allRows.filter((row) => normalize(row.name).includes(normalizedSearch))
      : allRows,
    [allRows, normalizedSearch],
  );
  const podiumRows = normalizedSearch ? [] : allRows.slice(0, 3);
  const startIndex = podiumRows.length === 3 ? 3 : 0;
  const visibleRows = filteredRows.slice(startIndex, startIndex + visibleCount);
  const bigWins = useMemo(
    () => generateBigWins(category, period, debates),
    [category, period, debates],
  );

  const selectCategory = (nextCategory: Category) => {
    setCategory(nextCategory);
    setVisibleCount(12);
  };

  const selectPeriod = (nextPeriod: Period) => {
    setPeriod(nextPeriod);
    setVisibleCount(12);
  };

  return (
    <div className="page leaderboard-page" id="page-leaderboard">
      <section className="lb-title-section">
        <div className="wrap lb-title-inner">
          <span className="lb-crown-icon"><CrownIcon /></span>
          <h1 className="lb-main-title">LEADERBOARD</h1>
        </div>

        {podiumRows.length === 3 && (
          <div className="lb-podium" aria-label="Leaderboard podium">
            <span className="lb-podium-blocks-bg" aria-hidden="true" />
            {[{ row: podiumRows[1], rank: 2 }, { row: podiumRows[0], rank: 1 }, { row: podiumRows[2], rank: 3 }].map(({ row, rank }) => (
              <article className={`lb-podium-card rank${rank}`} key={row.name}>
                <div className="lb-podium-avatar-wrap">
                  <span className="lb-podium-avatar">{row.name.charAt(0).toUpperCase()}</span>
                </div>
                <strong className="lb-podium-name">{row.name}</strong>
                <TierBadge rank={rank} />
                <span className="lb-podium-pnl">+{compactMoney(row.pnl)}</span>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="vs-hero-section leaderboard-hero">
        <div className="wrap">
          <span className="vs-hero-badge">Ranking</span>
          <h2 className="vs-hero-title">Who rules Korum</h2>
          <p>Traders, creators, referrers: three ways to earn, three leaderboards. Climb the ranks, defend your place, and make a name for yourself.</p>
          <label className="lb-search-wrap">
            <span className="icon" aria-hidden="true">⌕</span>
            <span className="sr-only">Search by username</span>
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setVisibleCount(12);
              }}
              placeholder="Search by username…"
            />
          </label>
        </div>
      </section>

      <section className="info-section leaderboard-section">
        <div className="wrap">
          <div className="lb-controls-row">
            <div className="lb-cat-tabs btn-glass" aria-label="Leaderboard category">
              {(["traders", "creators", "referrers"] as Category[]).map((item) => (
                <button
                  type="button"
                  className={category === item ? "active" : ""}
                  aria-pressed={category === item}
                  onClick={() => selectCategory(item)}
                  key={item}
                >
                  {{ traders: "Traders", creators: "Creators", referrers: "Referrers" }[item]}
                </button>
              ))}
            </div>
            <div className="lb-period-tabs" aria-label="Leaderboard period">
              {(["today", "week", "month", "all"] as Period[]).map((item) => (
                <button
                  type="button"
                  className={period === item ? "active" : ""}
                  aria-pressed={period === item}
                  onClick={() => selectPeriod(item)}
                  key={item}
                >
                  {{ today: "Today", week: "Weekly", month: "Monthly", all: "All time" }[item]}
                </button>
              ))}
            </div>
          </div>

          <div className="lb-table-wrap" role="table" aria-label="Korum leaderboard">
            <div className="lb-row head" role="row">
              <span>#</span>
              <span>Username</span>
              <button type="button" className={`lb-sortable ${sortMetric === "pnl" ? "active" : ""}`} onClick={() => setSortMetric("pnl")}>PnL</button>
              <button type="button" className={`lb-sortable ${sortMetric === "volume" ? "active" : ""}`} onClick={() => setSortMetric("volume")}>Volume</button>
              <span className="lb-align-right">{SECONDARY_LABELS[category]}</span>
            </div>

            {hydrated && connected && address && (
              <div className="lb-row lb-row-me">
                <span className="lb-rank">-</span>
                <span className="lb-name"><span className="lb-me-avatar-sm">{address.slice(2, 3).toUpperCase()}</span>{shortenAddress(address)}<span className="lb-you-tag">YOU</span></span>
                <span className="lb-vol buy">-</span>
                <span className="lb-vol">-</span>
                <span className="lb-win">-</span>
              </div>
            )}

            {visibleRows.map((row, index) => (
              <RankingRow row={row} rank={startIndex + index + 1} category={category} key={row.name} />
            ))}
          </div>

          {normalizedSearch && filteredRows.length === 0 && (
            <p className="lb-nomatch">No username matches your search.</p>
          )}

          {filteredRows.length > startIndex + visibleCount && (
            <div className="show-more-wrap">
              <button type="button" className="btn btn-glass" onClick={() => setVisibleCount((count) => count + 12)}>Show more</button>
            </div>
          )}

          <div className="info-head lb-big-wins-head">
            <span className="eyebrow">Standout wins</span>
            <h2>Biggest gains, {CATEGORY_LABELS[category]}</h2>
            <p>The highest-earning individual trades across all traders.</p>
          </div>

          <div className="leaderboard lb-big-wins" role="table" aria-label="Biggest gains">
            <div className="lb-row head" role="row">
              <span>#</span>
              <span>Username</span>
              <span>VS</span>
              <span className="lb-align-right">Gain</span>
              <span className="lb-align-right">Volume</span>
            </div>
            {bigWins.map((win, index) => (
              <div className="lb-row" key={`${win.id}-${win.name}-${index}`}>
                <span className="lb-rank">#{index + 1}</span>
                <span className="lb-name">{win.name}</span>
                <Link className="lb-win-vs" href={`/vs/${win.id}`}>{win.matchup}</Link>
                <span className="lb-vol buy">+{compactMoney(win.gain)}</span>
                <span className="lb-win">{compactMoney(win.volume)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
