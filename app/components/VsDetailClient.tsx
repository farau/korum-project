"use client";

import Link from "next/link";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";

import { useWatchlist } from "../hooks/useWatchlist";
import { useWallet } from "./WalletProvider";
import { KORUM_CHAIN } from "../config/korum-network";
import {
  TOKEN_CHART_QUERY_KEY,
  TOKEN_TRADES_QUERY_KEY,
  useIndexedDebate,
} from "../hooks/useIndexedMarkets";
import type { Debate, DebateToken } from "../lib/debates";
import { formatMarketValue, formatTokenAmount, formatTokenPrice } from "../lib/markets/format";
import MarketCandlestickChart, { type MarketChartCandle } from "./MarketCandlestickChart";
import TokenTradePanel from "./TokenTradePanel";
import styles from "./VsDetailClient.module.css";

type VsDetailClientProps = {
  indexedDebate: Debate | null;
  indexedReadFailed: boolean;
};

type InfoTab = "community" | "activity" | "holders" | "traders" | "creator" | "bubble" | "positions";
type ChartRange = "1h" | "1d" | "7d" | "30d" | "180d";
type ChartMetric = "price" | "marketCap";
type ChartResponse = {
  points: ChartCandle[];
  quoteUsd: number | null;
  intervalSeconds: number;
  windowStart: number;
  windowEnd: number;
};
type ChartCandle = MarketChartCandle & {
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
  price: number;
  marketCap: number;
  tradeCount?: number;
  synthetic?: boolean;
};
type MarketTrade = {
  id: string;
  venue: "curve" | "pool";
  side: "buy" | "sell";
  tokenAmount: string;
  quoteAmount: string;
  account: string;
  transactionHash: string;
  timestamp: number;
  tokenSymbol: string;
};
type VersusPositionsResponse = {
  positions: Array<{
    tokenAddress: string;
    tokenName: string;
    tokenSymbol: string;
    tokenAmount: string;
    valueEth: number | null;
    valueUsd: number | null;
    pnlEth: number | null;
    pnlUsd: number | null;
  }>;
  totalPnlEth: number | null;
  totalPnlUsd: number | null;
};

const CHART_RANGES: Array<{ value: ChartRange; label: string }> = [
  { value: "1h", label: "1H" },
  { value: "1d", label: "1D" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "180d", label: "180D" },
];
const CHART_REFRESH_MS: Record<ChartRange, number> = {
  "1h": 5_000,
  "1d": 15_000,
  "7d": 30_000,
  "30d": 60_000,
  "180d": 300_000,
};
const INFO_TABS: Array<{ id: InfoTab; label: string }> = [
  { id: "community", label: "Community" },
  { id: "activity", label: "Activity" },
  { id: "holders", label: "Holders" },
  { id: "traders", label: "Top Traders" },
  { id: "creator", label: "Token Creator" },
  { id: "bubble", label: "Bubble" },
  { id: "positions", label: "My Positions" },
];

function ShareIcon() {
  return <svg viewBox="0 0 69.04 69.06" fill="currentColor" aria-hidden="true"><path d="M14.93 61.32h39.11c2.98 0 5.67-.88 6.68-3.64.42-1.15.58-2.33.58-3.6l.02-15.76c0-2.16 1.79-3.76 3.8-3.77s3.83 1.59 3.84 3.77l.02 15.39c.85 8.85-6.46 16.15-15.31 15.29H15.35c-4.34.42-8.4-1.12-11.39-4.13C1.09 61.89-.38 57.83.08 53.54V15.54C-.38 11.26 1.1 7.16 3.96 4.23 6.96 1.1 11.01-.17 15.34.02l15.42.09c2.12.01 3.68 1.64 3.76 3.68s-1.45 3.92-3.6 3.93l-15.93.05c-2.88 0-5.57.82-6.61 3.49-.44 1.14-.64 2.27-.64 3.59v39.39c0 3.08 1.09 5.82 4.02 6.64 1.01.28 1.9.45 3.16.45Z" /><path d="m61.24 13.27-27.94 27.9c-1.55 1.55-3.99 1.35-5.39-.09-1.52-1.57-1.44-3.92.15-5.51L55.83 7.8 46 7.74c-2.18-.01-3.82-1.75-3.82-3.81S43.81.1 46.02.1h19c2.28-.01 3.97 1.68 3.96 3.95v19c-.01 2.21-1.79 3.84-3.86 3.83s-3.88-1.76-3.8-4l-.09-9.61Z" /></svg>;
}

function BellIcon() {
  return <svg viewBox="0 0 56.88 69.06" fill="currentColor" aria-hidden="true"><path d="M56.59 58.01c-.75 3.46-13.02 5.11-17.74 5.49l-.69-2.38c3.91-.37 7.7-.92 11.42-2.23 1.28-.45 2.46-1.01 3.32-2.09-.64-.9-1.51-1.42-2.47-1.81-10.03-4.04-31.99-3.93-42.48-.58-1.55.49-3.01 1.12-4.19 2.36 3.57 3.26 10.12 3.74 14.99 4.37l-.69 2.35C13.17 63.14-.11 61.39 0 57.35l.15-5.76c.46-1.96 2.92-2.1 4.11-3.17 1.76-1.6 2.36-4.24 2.85-6.5l2.94-13.81c1.86-7.91 5.11-15.77 13.33-18.03-1.74-3.54.1-6.97 3.35-8.34C27.15 1.18 27.42-.01 28.35 0s1.42.84 1.67 1.74c2.64 1.02 4.52 3.43 4.01 6.4l-2.38-.44c.18-1.06-.69-3.23-2-3.08-.94.11-1.31.55-2.54.06-.81-.32-1.6 1.11-1.8 1.79-.23.8-.16 2.54.82 3.01 9.42-.7 15.24 3.33 18.65 11.99 2.93 7.5 3.38 15.5 5.74 23.39-4.56-.95-8.71-1.47-13.46-1.87 2.55-1.55 5.26-1.77 8.15-2.24l-2.03-10.09c-.99-4.94-2.71-10.2-6.13-13.8-.32-.33-.77-.41-1.08-.26-.23.11-.65.51-.63.96.34 6.55-19.35 27.26-21.13 28.83 10.36-1.13 20.67-1.19 30.97.41 3.7.58 11.23 2.3 11.48 4.75.21 2.07.4 4.3-.07 6.46Z" /><path d="M31.8 62.2c-.07 2 .06 3.98-1.54 5.5-2.07 1.96-5.75 1.81-7.5-.53-1.28-1.72-1.25-3.97-.45-6 .67-1.71 2.25-3.13 4.32-3.77v-3.12l3.53-.06.07 3.16c2.19.68 3.84 2.23 4.45 4 .8 2.33.67 4.79-1.08 6.58.19-2.16.34-4.22-1.8-5.75Z" /></svg>;
}

function StarIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="m12 2.5 3 6.5 7 .9-5.2 4.9 1.4 7-6.2-3.5-6.2 3.5 1.4-7L2 9.9l7-.9z" /></svg>;
}

function CopyIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>;
}

function ExternalIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3h7v7M10 14 21 3" /><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" /></svg>;
}

function ChartIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3 17 5-5 4 3 6-8 3 3" /><path d="M3 3v18h18" /></svg>;
}

function shortAddress(address?: string) {
  if (!address) return "Not available";
  return address.length > 13 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

function symbolLabel(symbol?: string) {
  if (!symbol) return "$TOKEN";
  return symbol.startsWith("$") ? symbol : `$${symbol}`;
}

function formatCount(value?: number, available = true) {
  if (!available || value == null) return "—";
  return Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatAge(minutes: number) {
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1_440) return `${Math.round(minutes / 60)}h ago`;
  return `${Math.round(minutes / 1_440)}d ago`;
}

function formatDate(value?: string) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return `${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(date)} UTC`;
}

function getXUrl(socialsJson?: string) {
  if (!socialsJson) return null;
  try {
    const value: unknown = JSON.parse(socialsJson);
    if (!value || typeof value !== "object" || !("x" in value)) return null;
    const x = (value as { x?: unknown }).x;
    return typeof x === "string" && /^https:\/\/(?:www\.)?(?:x|twitter)\.com\//i.test(x) ? x : null;
  } catch {
    return null;
  }
}

function hasTokenMarketData(token?: DebateToken) {
  const values = [token?.marketCap, token?.volume24h, token?.trades24h, token?.priceEth];
  const histories = token?.priceHistory ?? [];
  return values.some((value) => typeof value === "number" && value !== 0) || histories.some((value) => value !== 0);
}

function hasMarketData(debate: Debate) {
  return hasTokenMarketData(debate.tokenA) || hasTokenMarketData(debate.tokenB);
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

function TokenAvatar({ token, side }: { token: DebateToken; side: "a" | "b" }) {
  const [failed, setFailed] = useState(false);
  const source = token.image || token.imageRef;
  return <span className={`${styles.tokenAvatar} ${side === "a" ? styles.tokenAvatarA : styles.tokenAvatarB}`}>{source && !failed ? <Image src={source} alt="" fill sizes="38px" unoptimized onError={() => setFailed(true)} /> : null}<span>{token.name.slice(0, 1).toUpperCase()}</span></span>;
}

function TokenPanel({ token, side, marketShare, marketAvailable, onStatus }: { token: DebateToken; side: "a" | "b"; marketShare: number; marketAvailable: boolean; onStatus: (message: string) => void }) {
  const symbol = symbolLabel(token.symbol);
  const currency = token.marketCurrency ?? "USD";
  const [range, setRange] = useState<ChartRange>("1d");
  const [chartMetric, setChartMetric] = useState<ChartMetric>("price");
  const [chartCurrency, setChartCurrency] = useState<"USD" | "ETH">(() => currency === "USD" && !token.quoteUsd ? "ETH" : currency);
  const displayedPrice = currency === "USD" ? token.priceUsd : token.priceEth;
  const curveLabel = token.curveStatus === 3
    ? "Pool live"
    : token.curveStatus === 2
      ? "Graduating"
      : token.graduationDisabled
        ? "Curve reopened"
        : "Bonding curve";

  const validTokenAddress = token.address && /^0x[0-9a-fA-F]{40}$/.test(token.address)
    ? token.address.toLowerCase()
    : null;
  const chartQuery = useQuery({
    queryKey: [TOKEN_CHART_QUERY_KEY, validTokenAddress, range],
    queryFn: async () => {
      const response = await fetch(`/api/markets/${validTokenAddress}/chart?range=${range}`);
      if (!response.ok) throw new Error("Market chart request failed.");
      return response.json() as Promise<ChartResponse>;
    },
    enabled: Boolean(validTokenAddress && marketAvailable),
    refetchInterval: CHART_REFRESH_MS[range],
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  const chartQuoteUsd = chartQuery.data?.quoteUsd ?? token.quoteUsd ?? null;
  const candles = useMemo<ChartCandle[]>(() => {
    if (!chartQuery.data) {
      const history = token.priceHistory ?? [];
      const currentPrice = currency === "USD" ? token.priceUsd : token.priceEth;
      const marketCapRatio = token.marketCap && currentPrice ? token.marketCap / currentPrice : 0;
      const multiplier = chartCurrency === currency
        ? 1
        : chartQuoteUsd
          ? chartCurrency === "USD" ? chartQuoteUsd : 1 / chartQuoteUsd
          : 1;
      const historyStart = Math.floor((token.launchTimestamp ?? token.createdAtTimestamp ?? 0) / 1_000);
      return history.map((price, index) => {
        const close = price * multiplier;
        const open = (history[index - 1] ?? price) * multiplier;
        const marketOpen = open * marketCapRatio;
        const marketClose = close * marketCapRatio;
        return {
          t: historyStart + index * 60,
          open,
          high: Math.max(open, close),
          low: Math.min(open, close),
          close,
          price: close,
          openMarketCap: marketOpen,
          highMarketCap: Math.max(marketOpen, marketClose),
          lowMarketCap: Math.min(marketOpen, marketClose),
          closeMarketCap: marketClose,
          marketCap: marketClose,
        };
      });
    }
    const multiplier = chartCurrency === "USD" && chartQuoteUsd ? chartQuoteUsd : 1;
    return chartQuery.data.points.map((point) => ({
      ...point,
      open: point.open * multiplier,
      high: point.high * multiplier,
      low: point.low * multiplier,
      close: point.close * multiplier,
      price: point.price * multiplier,
      openMarketCap: point.openMarketCap * multiplier,
      highMarketCap: point.highMarketCap * multiplier,
      lowMarketCap: point.lowMarketCap * multiplier,
      closeMarketCap: point.closeMarketCap * multiplier,
      marketCap: point.marketCap * multiplier,
    }));
  }, [chartCurrency, chartQuery.data, chartQuoteUsd, currency, token.createdAtTimestamp, token.launchTimestamp, token.marketCap, token.priceEth, token.priceHistory, token.priceUsd]);

  const handleCopy = async () => {
    if (!token.address) return;
    try {
      await copyText(token.address);
      onStatus(`${symbol} contract address copied.`);
    } catch {
      onStatus("Unable to access the clipboard.");
    }
  };

  return (
    <article className={styles.tokenPanel}>
      <div className={styles.tokenHead}>
        <TokenAvatar token={token} side={side} />
        <div className={styles.tokenIdentity}><strong>{symbol}</strong><span>{token.name}</span></div>
        {marketAvailable && marketShare >= 50 ? <span className={styles.leadingBadge}>LEADING</span> : null}
        <button className={styles.addressButton} type="button" onClick={handleCopy} disabled={!token.address} title="Copy contract address"><span>{shortAddress(token.address)}</span><CopyIcon /></button>
      </div>

      <div className={`${styles.chartCard} ${marketAvailable && marketShare >= 50 ? styles.leadingCard : ""}`}>
        <div className={styles.chartToolbar}>
          <span className={styles.segmented}><button className={chartMetric === "price" ? styles.selectedControl : ""} type="button" onClick={() => setChartMetric("price")}>Price</button><button className={chartMetric === "marketCap" ? styles.selectedControl : ""} type="button" onClick={() => setChartMetric("marketCap")}>MC</button></span>
          <span className={styles.segmented}><button className={chartCurrency === "USD" ? styles.selectedControl : ""} type="button" disabled={!chartQuoteUsd} onClick={() => setChartCurrency("USD")}>USD</button><button className={chartCurrency === "ETH" ? styles.selectedControl : ""} type="button" onClick={() => setChartCurrency("ETH")}>ETH</button></span>
          <span className={styles.timeframe}>{range.toUpperCase()}</span>
          <span className={styles.indexerState}><span /> Goldsky indexed</span>
        </div>
        <MarketCandlestickChart candles={candles} available={marketAvailable && (!chartQuery.isLoading || candles.length > 0)} metric={chartMetric} currency={chartCurrency} range={range} intervalSeconds={chartQuery.data?.intervalSeconds} windowStart={chartQuery.data?.windowStart} windowEnd={chartQuery.data?.windowEnd} />
        <div className={styles.periodRow} aria-label="Chart periods">{CHART_RANGES.map((period) => <button className={period.value === range ? styles.selectedControl : ""} type="button" key={period.value} disabled={!marketAvailable} onClick={() => setRange(period.value)}>{period.label}</button>)}</div>
        <div className={styles.marketStats}>
          <div><span>Current price</span><strong>{marketAvailable ? formatTokenPrice(displayedPrice, currency) : "—"}</strong></div>
          <div><span>Market cap</span><strong>{marketAvailable ? formatMarketValue(token.marketCap, currency) : "—"}</strong></div>
          <div><span>Adjusted FDV</span><strong>{marketAvailable ? formatMarketValue(token.fdv, currency) : "—"}</strong></div>
          <div><span>{curveLabel}</span><strong>{token.graduationProgress == null || !marketAvailable ? "—" : `${formatCount(token.graduationProgress)}%`}</strong></div>
          <div><span>24h volume</span><strong>{marketAvailable ? formatMarketValue(token.volume24h, currency) : "—"}</strong></div>
          <div><span>24h trades</span><strong>{formatCount(token.trades24h, marketAvailable)}</strong></div>
        </div>
      </div>

      <TokenTradePanel token={token} onStatus={onStatus} />
    </article>
  );
}

function EmptyIndexedPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className={styles.emptyPanel}><span className={styles.emptyPanelIcon}><ChartIcon /></span><strong>{title}</strong><p>{children}</p></div>;
}

function MarketActivity({ debate, tokenFilter }: { debate: Debate; tokenFilter: "both" | "a" | "b" }) {
  const tokenA = debate.tokenA;
  const tokenB = debate.tokenB;
  const candidates = [
    ...(tokenFilter !== "b" && tokenA ? [tokenA] : []),
    ...(tokenFilter !== "a" && tokenB ? [tokenB] : []),
  ].filter((token): token is DebateToken & { address: string } => Boolean(token.address && /^0x[0-9a-fA-F]{40}$/.test(token.address)));
  const activityQueryKey = candidates.map((token) => token.address.toLowerCase()).sort().join(":");
  const activityQuery = useQuery({
    queryKey: [TOKEN_TRADES_QUERY_KEY, activityQueryKey, 30],
    queryFn: async () => {
      const results = await Promise.all(candidates.map(async (token) => {
        const response = await fetch(`/api/markets/${token.address}/trades?limit=30`);
        if (!response.ok) throw new Error("Market trades request failed.");
        const payload = await response.json() as { trades: Array<Omit<MarketTrade, "tokenSymbol">> };
        return payload.trades.map((trade) => ({ ...trade, tokenSymbol: symbolLabel(token.symbol) }));
      }));
      return results.flat().sort((a, b) => b.timestamp - a.timestamp).slice(0, 30);
    },
    enabled: candidates.length > 0,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  const trades = candidates.length === 0 ? [] : activityQuery.data ?? null;

  if (trades === null) return <EmptyIndexedPanel title="Loading indexed activity">Reading recent curve and pool trades from Railway.</EmptyIndexedPanel>;
  if (trades.length === 0) return <EmptyIndexedPanel title="No indexed activity yet">Trades will appear here as soon as Goldsky indexes the first on-chain event.</EmptyIndexedPanel>;

  return <div className={styles.activityList}>{trades.map((trade) => {
    const quoteEth = Number(trade.quoteAmount);
    const quoteUsd = Number.isFinite(quoteEth) && debate.quoteUsd ? quoteEth * debate.quoteUsd : null;
    return <article className={styles.activityRow} key={`${trade.tokenSymbol}:${trade.id}`}>
      <span className={`${styles.activitySide} ${trade.side === "buy" ? styles.activityBuy : styles.activitySell}`}>{trade.side}</span>
      <div><strong>{trade.tokenSymbol}</strong><span>{formatTokenAmount(trade.tokenAmount)} tokens</span></div>
      <div><strong>{Number.isFinite(quoteEth) ? `${quoteEth.toLocaleString("en-US", { maximumFractionDigits: 6 })} ETH` : "—"}</strong><span>{quoteUsd === null ? "ETH quote" : formatMarketValue(quoteUsd, "USD")}</span></div>
      <span className={styles.activityVenue}>{trade.venue}</span>
      <div><strong>{shortAddress(trade.account)}</strong><span>{new Date(trade.timestamp * 1_000).toLocaleString("en-US")}</span></div>
      <a href={`${KORUM_CHAIN.blockExplorers.default.url}/tx/${trade.transactionHash}`} target="_blank" rel="noreferrer" aria-label="Open transaction"><ExternalIcon /></a>
    </article>;
  })}</div>;
}

function formatPnl(value: number | null, currency: "USD" | "ETH") {
  if (value === null) return "—";
  const formatted = formatMarketValue(Math.abs(value), currency, currency === "ETH" ? 5 : 2);
  return value > 0 ? `+${formatted}` : value < 0 ? `-${formatted}` : formatted;
}

function MyPositions({ versusId, quoteUsd }: { versusId: number; quoteUsd?: number }) {
  const { authenticated } = useWallet();
  const positionsQuery = useQuery({
    queryKey: ["versus-positions", versusId],
    queryFn: async () => {
      const response = await fetch(`/api/debates/${versusId}/positions`, { credentials: "same-origin" });
      if (response.status === 401) return null;
      if (!response.ok) throw new Error("Positions request failed.");
      return response.json() as Promise<VersusPositionsResponse>;
    },
    enabled: authenticated,
    staleTime: 5_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  if (!authenticated) return <EmptyIndexedPanel title="Wallet sign-in required">Connect and sign with your wallet to view the tokens you own in this Versus.</EmptyIndexedPanel>;
  if (positionsQuery.isLoading) return <EmptyIndexedPanel title="Loading your positions">Reading your indexed token balances from Railway.</EmptyIndexedPanel>;
  if (positionsQuery.isError) return <EmptyIndexedPanel title="Positions temporarily unavailable">The indexed position data could not be loaded. Please try again shortly.</EmptyIndexedPanel>;
  const result = positionsQuery.data;
  if (!result || result.positions.length === 0) return <EmptyIndexedPanel title="No open positions">You do not currently own either token in this Versus.</EmptyIndexedPanel>;
  const currency: "USD" | "ETH" = quoteUsd ? "USD" : "ETH";

  return <div className={styles.positionsPanel}>
    <div className={styles.positionsSummary}><span>Latent PNL</span><strong className={result.totalPnlEth !== null && result.totalPnlEth < 0 ? styles.pnlNegative : styles.pnlPositive}>{formatPnl(currency === "USD" ? result.totalPnlUsd : result.totalPnlEth, currency)}</strong></div>
    <div className={styles.positionsList}>{result.positions.map((position) => <article className={styles.positionRow} key={position.tokenAddress}>
      <div><strong>{symbolLabel(position.tokenSymbol)}</strong><span>{position.tokenName}</span></div>
      <div><strong>{formatTokenAmount(position.tokenAmount)}</strong><span>Owned</span></div>
      <div><strong>{formatMarketValue(currency === "USD" ? position.valueUsd : position.valueEth, currency)}</strong><span>Liquidation value</span></div>
      <div><strong className={position.pnlEth !== null && position.pnlEth < 0 ? styles.pnlNegative : styles.pnlPositive}>{formatPnl(currency === "USD" ? position.pnlUsd : position.pnlEth, currency)}</strong><span>Latent PNL</span></div>
    </article>)}</div>
  </div>;
}

function InfoPanel({ tab, debate, tokenFilter, onStatus }: { tab: InfoTab; debate: Debate; tokenFilter: "both" | "a" | "b"; onStatus: (message: string) => void }) {
  if (tab === "community") {
    return <div className={styles.communityPanel}><EmptyIndexedPanel title="The conversation starts here">Community messages will be enabled with token-gated participation in a future update.</EmptyIndexedPanel><textarea rows={3} maxLength={140} disabled placeholder={`Share your take on ${debate.sideA} vs ${debate.sideB}…`} /><button type="button" disabled>SEND</button></div>;
  }

  if (tab === "creator") {
    return <div className={styles.creatorPanel}><span className={styles.creatorAvatar}>{debate.creatorAddress?.slice(2, 4).toUpperCase() || "KR"}</span><div><span>Created by</span><strong>{debate.creatorName || shortAddress(debate.creatorAddress)}</strong><small>{debate.creatorAddress}</small></div>{debate.creatorAddress ? <button type="button" onClick={() => copyText(debate.creatorAddress!).then(() => onStatus("Creator wallet copied.")).catch(() => onStatus("Unable to access the clipboard."))}><CopyIcon /> Copy wallet</button> : null}</div>;
  }

  if (tab === "activity") return <MarketActivity debate={debate} tokenFilter={tokenFilter} />;
  if (tab === "positions") return <MyPositions versusId={debate.id} quoteUsd={debate.quoteUsd} />;

  const messages: Record<Exclude<InfoTab, "community" | "creator">, { title: string; body: string }> = {
    activity: { title: "No indexed activity yet", body: "Trades will appear here after their on-chain events are indexed." },
    holders: { title: "Holder distribution unavailable", body: "Goldsky currently indexes Versus creation metadata, but not token balances or holder snapshots." },
    traders: { title: "Trader rankings unavailable", body: "Rankings require indexed swap activity and wallet-level aggregates." },
    bubble: { title: "Ownership bubble map unavailable", body: "The map will be generated from indexed holder balances once that read model exists." },
    positions: { title: "No indexed positions", body: "Wallet positions will be shown after token balances and market prices are available." },
  };
  return <EmptyIndexedPanel title={messages[tab].title}>{messages[tab].body}</EmptyIndexedPanel>;
}

export default function VsDetailClient({ indexedDebate, indexedReadFailed }: VsDetailClientProps) {
  const versusId = String(indexedDebate?.id ?? "");
  const liveDebate = useIndexedDebate(versusId, indexedDebate);
  const { has, toggle } = useWatchlist();
  const [activeTab, setActiveTab] = useState<InfoTab>("community");
  const [tokenFilter, setTokenFilter] = useState<"both" | "a" | "b">("both");
  const [shareOpen, setShareOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const debate = liveDebate.data ?? indexedDebate;
  const currentIndexedReadFailed = !debate && (indexedReadFailed || liveDebate.isError);

  if (!debate) {
    return <div className={styles.notFound}><Link href="/explore">← Back to Explore</Link><h1>{currentIndexedReadFailed ? "Versus data is temporarily unavailable" : "Versus not found"}</h1><p>{currentIndexedReadFailed ? "The Railway indexer could not be reached. Please try again shortly." : "This Versus does not exist in the Railway indexer."}</p></div>;
  }

  const tokenA: DebateToken = debate.tokenA ?? { name: debate.sideA, symbol: debate.tokenASymbol || debate.sideA, image: debate.imageA };
  const tokenB: DebateToken = debate.tokenB ?? { name: debate.sideB, symbol: debate.tokenBSymbol || debate.sideB, image: debate.imageB };
  const marketAvailable = hasMarketData(debate);
  const tokenAMarketAvailable = hasTokenMarketData(tokenA);
  const tokenBMarketAvailable = hasTokenMarketData(tokenB);
  const sideAPercentage = marketAvailable ? Math.max(0, Math.min(100, debate.sideAPercentage ?? 50)) : 50;
  const sideBPercentage = 100 - sideAPercentage;
  const xUrl = getXUrl(debate.socialsJson);
  const starred = has(debate.id);

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: `${debate.sideA} vs ${debate.sideB}`, text: debate.title, url: window.location.href });
        setStatusMessage("Versus shared.");
      } else {
        await copyText(window.location.href);
        setStatusMessage("Versus link copied.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStatusMessage("Unable to share this Versus.");
    }
    setShareOpen(false);
  };

  const copyLink = async () => {
    try {
      await copyText(window.location.href);
      setStatusMessage("Versus link copied.");
    } catch {
      setStatusMessage("Unable to access the clipboard.");
    }
    setShareOpen(false);
  };

  const shareOnX = () => {
    const text = `${debate.sideA} vs ${debate.sideB} — pick your side on Korum`;
    window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(window.location.href)}`, "_blank", "noopener,noreferrer");
    setShareOpen(false);
  };

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.wrap}>
          <Link href="/explore" className={styles.backLink}>← Back to Explore</Link>
          <div className={styles.titleRow}>
            <div className={styles.titleBlock}><div className={styles.matchupLabel}><span>{symbolLabel(tokenA.symbol)}</span><b>VS</b><span>{symbolLabel(tokenB.symbol)}</span></div><h1><span className={sideAPercentage >= 50 && marketAvailable ? styles.heroLeader : ""}>{debate.sideA}</span> <em>vs</em> <span className={sideBPercentage > 50 && marketAvailable ? styles.heroLeader : ""}>{debate.sideB}</span></h1></div>
            {xUrl ? <a className={styles.xLink} href={xUrl} target="_blank" rel="noreferrer" aria-label="Open the Versus X account">𝕏</a> : null}
            <div className={styles.heroActions}>
              <button className={`${styles.roundButton} ${starred ? styles.starred : ""}`} type="button" aria-pressed={starred} aria-label={starred ? "Remove from watchlist" : "Add to watchlist"} onClick={() => toggle(debate.id, `${debate.sideA} vs ${debate.sideB}`)}><StarIcon /></button>
              <button className={styles.actionButton} type="button" onClick={() => setStatusMessage("Market alerts will be available after trading events are indexed.")}><BellIcon /> New Alert</button>
              <div className={styles.shareMenuWrap}>
                <button className={styles.actionButton} type="button" aria-expanded={shareOpen} onClick={() => setShareOpen((open) => !open)}>Share <ShareIcon /></button>
                {shareOpen ? <div className={styles.shareMenu}><button type="button" onClick={copyLink}><CopyIcon /> Copy link</button><button type="button" onClick={shareOnX}>𝕏 Share on X</button><button type="button" onClick={share}><ExternalIcon /> More options</button></div> : null}
              </div>
            </div>
          </div>

          <div className={styles.metaRow}><span className={styles.category}>{debate.category}</span><span>·</span><span>Launched {formatAge(debate.createdMinutesAgo)}</span><span>·</span><span>Created by <b>{debate.creatorName || shortAddress(debate.creatorAddress)}</b></span><span>·</span><span>Versus #{debate.id}</span></div>

          <div className={styles.overview}>
            <div className={styles.overviewLabels}><span className={sideAPercentage >= 50 && marketAvailable ? styles.leadingPill : ""}>{symbolLabel(tokenA.symbol)} · {sideAPercentage}%</span><span className={sideBPercentage > 50 && marketAvailable ? styles.leadingPill : ""}>{symbolLabel(tokenB.symbol)} · {sideBPercentage}%</span></div>
            <div className={styles.meter} aria-label={`${sideAPercentage}% ${debate.sideA}, ${sideBPercentage}% ${debate.sideB}`}><span className={sideAPercentage >= 50 && marketAvailable ? styles.meterLeading : ""} style={{ width: `${sideAPercentage}%` }} /><span className={sideBPercentage > 50 && marketAvailable ? styles.meterLeading : ""} style={{ width: `${sideBPercentage}%` }} /></div>
          </div>

          <div className={styles.debateCopy}><h2>{debate.title || `${debate.sideA} or ${debate.sideB}?`}</h2>{debate.description ? <p>{debate.description}</p> : null}</div>
          {!marketAvailable ? <div className={styles.dataNotice}><span /> Market events are being backfilled by Goldsky. Creation metadata remains available from Railway.</div> : null}
        </div>
      </section>

      <section className={styles.content}>
        <div className={styles.wrap}>
          <div className={styles.panels}><TokenPanel token={tokenA} side="a" marketShare={sideAPercentage} marketAvailable={tokenAMarketAvailable} onStatus={setStatusMessage} /><TokenPanel token={tokenB} side="b" marketShare={sideBPercentage} marketAvailable={tokenBMarketAvailable} onStatus={setStatusMessage} /></div>

          <div className={styles.infoCard}>
            <div className={styles.infoTop}>
              <div className={styles.infoTabs} role="tablist" aria-label="Versus information">{INFO_TABS.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} className={activeTab === tab.id ? styles.activeTab : ""} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}</div>
              <div className={styles.tokenFilter} aria-label="Filter by camp"><button type="button" className={tokenFilter === "both" ? styles.activeTab : ""} onClick={() => setTokenFilter("both")}>Both</button><button type="button" className={tokenFilter === "a" ? styles.activeTab : ""} onClick={() => setTokenFilter("a")}>{symbolLabel(tokenA.symbol)}</button><button type="button" className={tokenFilter === "b" ? styles.activeTab : ""} onClick={() => setTokenFilter("b")}>{symbolLabel(tokenB.symbol)}</button></div>
            </div>
            <div className={styles.infoBody} role="tabpanel"><InfoPanel tab={activeTab} debate={debate} tokenFilter={tokenFilter} onStatus={setStatusMessage} /></div>
          </div>

          <div className={styles.provenance}><span><b>Network</b>{tokenA.chainName || "Robinhood Chain Testnet"}</span><span><b>Created</b>{formatDate(debate.createdAtUtc || debate.createdAt)}</span><span><b>Data source</b>Goldsky → Railway PostgreSQL</span></div>
        </div>
      </section>

      {statusMessage ? <button type="button" className={styles.toast} onClick={() => setStatusMessage("")}><strong>Korum</strong><span>{statusMessage}</span></button> : null}
    </div>
  );
}
