"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Debate, DebateToken } from "../../lib/debates";
import { formatMarketValue } from "../../lib/markets/format";
import { useWatchlist } from "../../hooks/useWatchlist";
import TokenTradePanel, { type TradeMode } from "../TokenTradePanel";

const creators = ["Yasmine", "Léo", "Sam", "Nina", "Ines", "Marco"];
const qa = ["0.001", "0.01", "0.1"];

function totalMarketCap(debate: Debate) {
  return (debate.marketCapA || 0) + (debate.marketCapB || 0);
}

function debateVolume(debate: Debate) {
  return debate.volume24h;
}

function debateParticipants(debate: Debate) {
  return debate.participantCount ?? 0;
}

function fmtAgeFromMinutes(minutes: number) {
  if (minutes < 60) return `il y a ${minutes} min`;
  if (minutes < 1440) return `il y a ${Math.round(minutes / 60)}h`;
  return `il y a ${Math.round(minutes / 1440)}j`;
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

function Spark({ series }: { series?: number[] }) {
  const values = series?.slice(-24) ?? [];
  const min = values.length ? Math.min(...values) : 0;
  const range = values.length ? Math.max(...values) - min || 1 : 1;
  const points = values.length > 1
    ? values.map((value, index) => `${index * 130 / (values.length - 1)},${20 - ((value - min) / range) * 16}`).join(" ")
    : "";
  return (
    <svg className="vs-mini-spark" viewBox="0 0 130 22" preserveAspectRatio="none" fill="none" aria-hidden>
      {points ? <polyline points={points} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /> : null}
    </svg>
  );
}

export default function VsCard({ debate, index = 0, inlineTrading = false }: { debate: Debate; index?: number; inlineTrading?: boolean }) {
  const router = useRouter();
  const tokenA = getTokenA(debate);
  const tokenB = getTokenB(debate);
  const currency = debate.marketCurrency ?? "USD";
  const sideAPercentage = tokenA.marketCap && tokenB.marketCap ? Math.round((tokenA.marketCap / (tokenA.marketCap + tokenB.marketCap)) * 100) : debate.sideAPercentage || 50;
  const leaderIsA = sideAPercentage >= 50;
  const { toggle, has } = useWatchlist();
  const starred = has(debate.id);
  const [mode, setMode] = React.useState<TradeMode>("buy");
  const [side, setSide] = React.useState<"sideA" | "sideB">(leaderIsA ? "sideA" : "sideB");
  const [amount, setAmount] = React.useState("0.01");
  const [tradeExpanded, setTradeExpanded] = React.useState(false);
  const [tradeStatus, setTradeStatus] = React.useState("");
  const [failedImages, setFailedImages] = React.useState({ debateId: debate.id, sideA: false, sideB: false });
  const [now, setNow] = React.useState<number | null>(null);

  React.useEffect(() => {
    const syncNow = () => setNow(Date.now());
    const kickoff = window.setTimeout(syncNow, 0);
    const timer = window.setInterval(syncNow, 60_000);
    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(timer);
    };
  }, []);

  const selected = side === "sideA" ? tokenA.symbol : tokenB.symbol;
  const imageA = failedImages.debateId === debate.id && failedImages.sideA ? undefined : tokenA.image || tokenA.imageRef;
  const imageB = failedImages.debateId === debate.id && failedImages.sideB ? undefined : tokenB.image || tokenB.imageRef;
  const creatorName = debate.creatorName || creators[index % creators.length];
  const creatorRankLabel = debate.creatorRankLabel ?? null;
  const creatorRankClass = debate.creatorRankClass;
  const changeA24h = tokenA.change24h ?? 0;
  const changeB24h = tokenB.change24h ?? 0;
  const debateTimestamp = timestampMs(debate.launchedAtUtc || debate.launchedAt || debate.createdAtUtc || debate.createdAt) ?? timestampMs(debate.launchTimestamp ?? debate.createdAtTimestamp);
  const tokenATimestamp = timestampMs(tokenA.launchedAt) ?? timestampMs(tokenA.launchTimestamp);
  const tokenBTimestamp = timestampMs(tokenB.launchedAt) ?? timestampMs(tokenB.launchTimestamp);
  const newestLaunchTimestamp = Math.max(tokenATimestamp ?? debateTimestamp ?? 0, tokenBTimestamp ?? debateTimestamp ?? 0) || debateTimestamp;
  const ageLabel = relativeAge(newestLaunchTimestamp, now, debate.createdMinutesAgo);
  const selectedToken = side === "sideA" ? tokenA : tokenB;

  function selectTradeMode(nextMode: TradeMode) {
    setMode(nextMode);
    setTradeStatus("");
    setTradeExpanded(false);
  }

  function openVersus(event: React.MouseEvent<HTMLElement>) {
    const target = event.target;
    if (target instanceof Element && target.closest("a, button, input, select, textarea, [role='button']")) return;
    router.push(`/vs/${debate.id}`);
  }

  return (
    <>
      <article className={`vs-card in mode-${mode}`} onClick={openVersus}>
      <Link href={`/vs/${debate.id}`} className="vs-card-link" aria-label={`${tokenA.name} vs ${tokenB.name}`}>
        <div className="vs-thumb-pair">
          <div className="thumb-square">
            <div className="thumb-square-inner token-bg-a">
              {imageA ? (
                <Image
                  className="thumb-photo"
                  src={imageA}
                  alt={debate.sideA}
                  fill
                  sizes="(max-width: 560px) 50vw, (max-width: 1180px) 17vw, 150px"
                  loading={index === 0 ? "eager" : "lazy"}
                  unoptimized
                  onError={() => setFailedImages((current) => ({ debateId: debate.id, sideA: true, sideB: current.debateId === debate.id ? current.sideB : false }))}
                />
              ) : null}
              <span className="thumb-initial">{tokenA.name.charAt(0).toUpperCase()}</span>
              <span className="thumb-title">{tokenA.name}</span>
            </div>
          </div>
          <div className="thumb-square">
            <div className="thumb-square-inner token-bg-b">
              {imageB ? (
                <Image
                  className="thumb-photo"
                  src={imageB}
                  alt={debate.sideB}
                  fill
                  sizes="(max-width: 560px) 50vw, (max-width: 1180px) 17vw, 150px"
                  loading={index === 0 ? "eager" : "lazy"}
                  unoptimized
                  onError={() => setFailedImages((current) => ({ debateId: debate.id, sideA: current.debateId === debate.id ? current.sideA : false, sideB: true }))}
                />
              ) : null}
              <span className="thumb-initial">{tokenB.name.charAt(0).toUpperCase()}</span>
              <span className="thumb-title">{tokenB.name}</span>
            </div>
          </div>
          <span className="thumb-vs-badge">VS</span>
          <span className="vs-thumb-badge">{debate.category}</span>
          <span className="vs-thumb-age">{ageLabel}</span>
        </div>
      </Link>

      <div className="vs-body">
        <div className="creator-line">
          <span>par</span>
          <span className="name">{creatorName}</span>
          {creatorRankLabel && creatorRankClass ? <span className={`creator-rank ${creatorRankClass}`}>{creatorRankLabel}</span> : null}
          {debate.creatorIsNew ? <span className="creator-rank new">NEW CREATOR</span> : null}
        </div>

        <div className="vs-chart-row">
          <div className={`vs-chart-col a ${leaderIsA ? "leading" : ""}`}>
            <div className="chart-head">
              <span className="price">{formatMarketValue(tokenA.marketCap ?? totalMarketCap(debate) / 2, currency, 1)}</span>
              <span className={changeA24h >= 0 ? "chg up" : "chg down"}>{changeA24h >= 0 ? "+" : ""}{changeA24h.toFixed(1)}%</span>
            </div>
            <Spark series={tokenA.priceHistory} />
          </div>
          <div className={`vs-chart-col b ${!leaderIsA ? "leading" : ""}`}>
            <div className="chart-head">
              <span className={changeB24h >= 0 ? "chg up" : "chg down"}>{changeB24h >= 0 ? "+" : ""}{changeB24h.toFixed(1)}%</span>
              <span className="price">{formatMarketValue(tokenB.marketCap ?? totalMarketCap(debate) / 2, currency, 1)}</span>
            </div>
            <Spark series={tokenB.priceHistory} />
          </div>
        </div>

        <div className="vs-meter-row">
          <span className={`vs-meter-pct ${leaderIsA ? "lead" : ""}`}>{sideAPercentage}%</span>
          <div className="vs-meter">
            <div className={`bar ${leaderIsA ? "lead" : ""}`} style={{ width: `${sideAPercentage}%` }} />
            <div className={`bar ${!leaderIsA ? "lead" : ""}`} style={{ width: `${100 - sideAPercentage}%` }} />
          </div>
          <span className={`vs-meter-pct ${!leaderIsA ? "lead" : ""}`}>{100 - sideAPercentage}%</span>
        </div>

        <div className="vs-stats-row">
          <div className="stat-item">
            <svg className="stat-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <rect x="4" y="14" width="3.4" height="6" />
              <rect x="10.3" y="9" width="3.4" height="11" />
              <rect x="16.6" y="4" width="3.4" height="16" />
            </svg>
            <span className="stat-text"><span className="lbl">MCAP total</span><span className="val">{formatMarketValue(totalMarketCap(debate), currency, 1)}</span></span>
          </div>
          <div className="stat-item">
            <svg className="stat-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="8.5" cy="8" r="3" />
              <path d="M2.8 20c0-3.3 2.6-5.6 5.7-5.6s5.7 2.3 5.7 5.6" />
              <circle cx="17" cy="9" r="2.2" />
              <path d="M15.3 14.4c2.5.4 4.1 2.2 4.1 4.9" />
            </svg>
            <span className="stat-text"><span className="lbl">Parieurs</span><span className="val">{debateParticipants(debate).toLocaleString("fr-FR")}</span></span>
          </div>
          <div className="stat-item">
            <svg className="stat-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 16l5-6 4 3 5-7 4 4" />
            </svg>
            <span className="stat-text"><span className="lbl">Vol 24h</span><span className="val">{formatMarketValue(debateVolume(debate), currency, 1)}</span></span>
          </div>
        </div>

        <div className="trade-toggle">
          <button type="button" data-mode-btn="buy" className={mode === "buy" ? "active" : ""} onClick={() => selectTradeMode("buy")}>Acheter</button>
          <button type="button" data-mode-btn="sell" className={mode === "sell" ? "active" : ""} onClick={() => selectTradeMode("sell")}>Vendre</button>
        </div>

        <div className="vs-quick-amount">
          <span className="qa-label">Mise</span>
          {qa.map((quickAmount) => (
            <button
              type="button"
              className={`qa-btn ${amount === quickAmount ? "active" : ""}`}
              data-usd={`≈ ${formatMarketValue(Number(quickAmount) * 3200, "USD")}`}
              onClick={() => { setAmount(quickAmount); setTradeExpanded(false); setTradeStatus(""); }}
              key={quickAmount}
            >
              {quickAmount.replace(".", ",")}
            </button>
          ))}
          <button type="button" className={`qa-btn qa-btn-max ${amount === "max" ? "active" : ""}`} data-usd="≈ max" onClick={() => { setAmount("max"); setTradeExpanded(false); setTradeStatus(""); }}>MAX</button>
          <span className="qa-unit" aria-label="ether">◆ ETH</span>
        </div>

        <div className="vs-buy-row">
          <button className={`vs-buy ${side === "sideA" ? "active" : ""}`} type="button" onClick={() => { setSide("sideA"); setTradeStatus(""); }}>{tokenA.symbol}</button>
          <button className={`vs-buy ${side === "sideB" ? "active" : ""}`} type="button" onClick={() => { setSide("sideB"); setTradeStatus(""); }}>{tokenB.symbol}</button>
        </div>

        {inlineTrading && tradeExpanded ? (
          <>
            <div className="vs-inline-trade">
              <TokenTradePanel
                key={`${selectedToken.address ?? selectedToken.symbol}-${mode}`}
                token={selectedToken}
                initialMode={mode}
                initialAmount={amount === "max" ? undefined : amount}
                compact
                onStatus={setTradeStatus}
              />
              {tradeStatus ? <p className="vs-inline-trade-status" role="status">{tradeStatus}</p> : null}
            </div>
          </>
        ) : (
          <button type="button" className="vs-cta-buy" onClick={() => inlineTrading && setTradeExpanded(true)}>
            <span className="vs-cta-label">{mode === "buy" ? "Acheter" : "Vendre"} {selected}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        )}

        <div className="vs-foot-note" aria-hidden="true">
          <span className="fn-item">▣ Sors quand tu veux</span>
          <span className="fn-sep" />
          <span className="fn-item">▤ Payé sur le volume généré</span>
        </div>

        <button
          type="button"
          className={`watchlist-mini ${starred ? "active" : ""}`}
          aria-label={starred ? "Remove from watchlist" : "Add to watchlist"}
          aria-pressed={starred}
          title={starred ? "Remove from watchlist" : "Add to watchlist"}
          onClick={() => toggle(debate.id, `${debate.sideA} vs ${debate.sideB}`)}
        >
          {starred ? "★" : "☆"}
        </button>
        </div>
      </article>
    </>
  );
}
