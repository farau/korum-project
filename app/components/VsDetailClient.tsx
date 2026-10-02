"use client";

import { slideChart, replaceChartHead, type ChartSnapshot, type ChartCandle } from "../lib/live/chart";
import { useMarketLive, marketNoticeVersion } from "../hooks/useMarketLive";

import Link from "next/link";
import BellIcon from "./BellIcon";
import Image from "next/image";
import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import React, { useCallback, useEffect, useMemo, useState } from "react";

import { useWatchlist } from "../hooks/useWatchlist";
import { useWallet } from "./WalletProvider";
import { KORUM_CHAIN } from "../config/korum-network";
import {
  TOKEN_CHART_QUERY_KEY,
  TOKEN_TRADES_QUERY_KEY,
  useIndexedDebate,
} from "../hooks/useIndexedMarkets";
import type { Debate, DebateToken } from "../lib/debates";
import { normalizeSocialLinks, socialLinksFromJson } from "../lib/versus-socials";
import { formatMarketValue, formatTokenAmount } from "../lib/markets/format";
import MarketCandlestickChart from "./MarketCandlestickChart";
import GraduatedPoolChart from "./GraduatedPoolChart";
import { GRADUATING_MESSAGE, usesKorumCandles } from "../lib/markets/venue";
import TokenTradePanel from "./TokenTradePanel";
import ProfileAvatar from "./ProfileAvatar";
import CreatorFeeTransfer from "./CreatorFeeTransfer";
import PendingCreatorFeeNotice from "./PendingCreatorFeeNotice";
import styles from "./VsDetailClient.module.css";

type VsDetailClientProps = {
  indexedDebate: Debate | null;
  indexedReadFailed: boolean;
};

type InfoTab = "community" | "activity" | "holders" | "traders" | "creator" | "bubble" | "positions";
type ChartRange = "1s" | "1m" | "5m" | "15m" | "1h" | "4h" | "1d" | "7d" | "30d" | "180d" | "all";
type ChartMetric = "price" | "marketCap";
type ChartResponse = ChartSnapshot;
type LiveCampMarket = { address: string; marketCapEth: number; lastTradeTimestamp: number };
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

const BONDING_CURVE_RANGES: Array<{ value: ChartRange; label: string }> = [
  { value: "1s", label: "1s" },
  { value: "1m", label: "1m" },
  { value: "5m", label: "5m" },
  { value: "15m", label: "15m" },
  { value: "1h", label: "1h" },
  { value: "4h", label: "4h" },
  { value: "1d", label: "1d" },
];
const CHART_REFRESH_MS: Record<ChartRange, number> = {
  "1s": 5_000,
  "1m": 2_000,
  "5m": 3_000,
  "15m": 5_000,
  "1h": 5_000,
  "4h": 10_000,
  "1d": 15_000,
  "7d": 30_000,
  "30d": 60_000,
  "180d": 300_000,
  "all": 300_000,
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

function StatIcon({ kind }: { kind: "market" | "people" | "volume" }) {
  if (kind === "people") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6m1 4a5 5 0 0 1 3 5" /></svg>;
  if (kind === "volume") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3v18h18M6 16l5-5 3 3 5-7" /><path d="M16 7h3v3" /></svg>;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M3 21h18M6 18v-6m4 6V7m4 11V4m4 14v-9" /></svg>;
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

function marketPreferenceLabel(
  tokenA: DebateToken,
  tokenB: DebateToken,
  sideAPercentage: number,
  marketAvailable: boolean,
) {
  if (!marketAvailable) return "MARKET IS FORMING";
  if (sideAPercentage === 50) return "MARKET IS TIED";

  const leader = sideAPercentage > 50 ? tokenA : tokenB;
  const percentage = sideAPercentage > 50 ? sideAPercentage : 100 - sideAPercentage;
  return `${percentage}% PREFERS ${leader.name.toUpperCase()}`;
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
  return <span className={`${styles.tokenAvatar} ${side === "a" ? styles.tokenAvatarA : styles.tokenAvatarB}`}>{source && !failed ? <Image src={source} alt="" fill sizes="72px" unoptimized onError={() => setFailed(true)} /> : null}<span>{token.name.slice(0, 1).toUpperCase()}</span></span>;
}

function TokenPanel({ token, side, marketShare, marketAvailable, onMarketUpdate, onStatus }: { token: DebateToken; side: "a" | "b"; marketShare: number; marketAvailable: boolean; onMarketUpdate: (side: "a" | "b", market: LiveCampMarket) => void; onStatus: (message: string) => void }) {
  const symbol = symbolLabel(token.symbol);
  const isLeading = marketAvailable && marketShare > 50;
  const currency = token.marketCurrency ?? "USD";
  const [range, setRange] = useState<ChartRange>("1m");
  const [chartMetric, setChartMetric] = useState<ChartMetric>("price");
  const [chartCurrency, setChartCurrency] = useState<"USD" | "ETH">(() => currency === "USD" && !token.quoteUsd ? "ETH" : currency);
  const [observedVenue, setObservedVenue] = useState<{ address: string; status: number } | null>(null);
  const curveStatus = token.curveStatus === 3 ? 3
    : token.curveStatus === 2 && observedVenue?.status !== 3 ? 2
    : observedVenue && observedVenue.address === token.address?.toLowerCase() ? observedVenue.status : token.curveStatus;
  const chartEnabled = marketAvailable && usesKorumCandles(curveStatus);
  const chartRanges = BONDING_CURVE_RANGES;
  const isRangeAvailable = chartRanges.some((period) => period.value === range);
  const activeRange = isRangeAvailable ? range : chartRanges[0].value;

  const validTokenAddress = token.address && /^0x[0-9a-fA-F]{40}$/.test(token.address)
    ? token.address.toLowerCase()
    : null;
  const live = useMarketLive(validTokenAddress);
  const queryClient = useQueryClient();
  const handleCurveStatus = useCallback((address: string, status: number) => {
    setObservedVenue(previous => previous?.address === address && previous.status === status ? previous : { address, status });
  }, []);
  const chartKey = useMemo(() => [TOKEN_CHART_QUERY_KEY, validTokenAddress, activeRange], [validTokenAddress, activeRange]);
  const readChart = async (response: Response, signal: AbortSignal) => {
    if (response.status === 409) {
      const venue = await response.json() as { curveStatus: number };
      if (!signal.aborted && validTokenAddress) handleCurveStatus(validTokenAddress, venue.curveStatus);
    }
    if (!response.ok) throw new Error("Market chart request failed.");
    return response.json() as Promise<ChartResponse>;
  };
  const chartQuery = useInfiniteQuery({
    queryKey: chartKey,
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage: ChartResponse) => {
      if (activeRange === "1s" || !lastPage.hasMore) return undefined;
      if (lastPage.points.length === 0 && lastPage.lastTradeTimestamp !== null) {
        return Math.floor(lastPage.lastTradeTimestamp / lastPage.intervalSeconds) * lastPage.intervalSeconds + lastPage.intervalSeconds;
      }
      return lastPage.windowStart;
    },
    queryFn: async ({ signal, pageParam }) => {
      const before = pageParam === undefined ? "" : `&before=${pageParam}`;
      const response = await fetch(`/api/markets/${validTokenAddress}/chart?range=${activeRange}&limit=300${before}`, { signal, cache: "no-store" });
      return readChart(response, signal);
    },
    enabled: Boolean(validTokenAddress && chartEnabled),
    // Periodic synchronization below refreshes only the latest page.
    refetchInterval: false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  useEffect(() => {
    if (!validTokenAddress || !chartEnabled) return;
    let controller: AbortController | undefined;
    const timer = window.setInterval(async () => {
      if (document.visibilityState === "hidden" || controller || queryClient.isFetching({ queryKey: chartKey })) return;
      const request = new AbortController();
      controller = request;
      const version = marketNoticeVersion();
      try {
        const response = await fetch(`/api/markets/${validTokenAddress}/chart?range=${activeRange}&limit=300`, {
          signal: request.signal, cache: "no-store",
        });
        if (response.status === 409) {
          const venue = await response.json() as { curveStatus: number };
          if (!request.signal.aborted) handleCurveStatus(validTokenAddress, venue.curveStatus);
          return;
        }
        if (!response.ok) return;
        const page = await response.json() as ChartResponse;
        if (request.signal.aborted || version !== marketNoticeVersion()) return;
        queryClient.setQueryData<InfiniteData<ChartResponse>>(chartKey, data => {
          if (!data) return data;
          const current = data.pages[0];
          // A live event may have arrived while this snapshot was loading.
          if (current.lastTradeCursor && (!page.lastTradeCursor
            || current.lastTradeCursor.block > page.lastTradeCursor.block
            || (current.lastTradeCursor.block === page.lastTradeCursor.block && current.lastTradeCursor.log > page.lastTradeCursor.log))) return data;
          return replaceChartHead(data, page);
        });
      } catch { /* Keep the existing chart; the next interval retries. */ }
      finally { controller = undefined; }
    }, live ? Math.max(60_000, CHART_REFRESH_MS[activeRange]) : Math.max(5_000, CHART_REFRESH_MS[activeRange]));
    return () => { window.clearInterval(timer); controller?.abort(); };
  }, [activeRange, chartKey, live, chartEnabled, queryClient, validTokenAddress, handleCurveStatus]);

  useEffect(() => {
    if (!chartEnabled || activeRange !== "1s") return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      queryClient.setQueryData<InfiniteData<ChartResponse>>(chartKey, data => data ? {
        ...data, pages: [slideChart(data.pages[0], Math.floor(Date.now() / 1000))], pageParams: [undefined],
      } : data);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeRange, chartKey, chartEnabled, queryClient]);
  const latestPage = chartEnabled ? chartQuery.data?.pages[0] : undefined;
  const latestMarketCapEth = latestPage?.points.at(-1)?.closeMarketCap ?? latestPage?.priorMarketCap;
  const lastTradeTimestamp = latestPage?.lastTradeTimestamp;
  useEffect(() => {
    if (!validTokenAddress || latestMarketCapEth == null || !Number.isFinite(latestMarketCapEth) || latestMarketCapEth < 0 || lastTradeTimestamp == null) return;
    onMarketUpdate(side, { address: validTokenAddress, marketCapEth: latestMarketCapEth, lastTradeTimestamp });
  }, [lastTradeTimestamp, latestMarketCapEth, onMarketUpdate, side, validTokenAddress]);
  const chartQuoteUsd = latestPage?.quoteUsd ?? token.quoteUsd ?? null;
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = chartQuery;
  const pageCount = chartQuery.data?.pages.length;
  useEffect(() => {
    if (chartEnabled && activeRange !== "1s" && latestPage?.points.length === 0 && pageCount === 1 && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage({ cancelRefetch: false });
    }
  }, [activeRange, chartEnabled, fetchNextPage, hasNextPage, isFetchingNextPage, latestPage, pageCount]);
  const candles = useMemo<ChartCandle[]>(() => {
    if (!chartEnabled || !chartQuery.data) {
      return [];
    }
    const multiplier = chartCurrency === "USD" && chartQuoteUsd ? chartQuoteUsd : 1;
    const points = new Map<number, ChartCandle>();
    for (const page of [...chartQuery.data.pages].reverse()) {
      for (const point of page.points) points.set(point.t, point);
    }
    return [...points.values()].sort((a, b) => a.t - b.t).map((point) => ({
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
  }, [chartCurrency, chartQuery.data, chartQuoteUsd, chartEnabled]);
  const chartWindows = useMemo(() => {
    const multiplier = chartCurrency === "USD" && chartQuoteUsd ? chartQuoteUsd : 1;
    return chartQuery.data?.pages.map(page => ({
      start: page.windowStart,
      end: page.windowEnd,
      priorPrice: page.priorPrice === null ? null : page.priorPrice * multiplier,
      priorMarketCap: page.priorMarketCap === null ? null : page.priorMarketCap * multiplier,
      priorPriceUp: page.priorPriceUp,
      priorMarketCapUp: page.priorMarketCapUp,
      priorTimestamp: page.priorTimestamp,
    })) ?? [];
  }, [chartCurrency, chartQuery.data, chartQuoteUsd]);

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
    <article className={`${styles.tokenPanel} ${marketAvailable && marketShare !== 50 ? isLeading ? styles.tokenPanelLeading : styles.tokenPanelTrailing : styles.tokenPanelNeutral}`}>
      <div className={styles.tokenHead}>
        <TokenAvatar token={token} side={side} />
        <div className={styles.tokenIdentity}><strong>{symbol}</strong><span>{token.name}</span><span className={styles.sideSignal} aria-hidden="true" /></div>
        {isLeading ? <span className={styles.leadingBadge}>LEADING</span> : null}
        <button className={styles.addressButton} type="button" onClick={handleCopy} disabled={!token.address} title="Copy contract address"><span>{shortAddress(token.address)}</span><CopyIcon /></button>
      </div>

      <div className={`${styles.chartCard} ${isLeading ? styles.leadingCard : ""}`}>
        {curveStatus === 3 ? <GraduatedPoolChart tokenAddress={validTokenAddress} symbol={symbol} /> : curveStatus === 2 ? <div className={styles.poolChartPending} role="status"><strong>{GRADUATING_MESSAGE}</strong><span>Trading resumes when liquidity is available on Uniswap.</span></div> : <>
        <div className={styles.chartToolbar}>
          <div className={styles.periodRow} aria-label="Candle intervals">{chartRanges.map((period) => <button className={period.value === activeRange ? styles.selectedControl : ""} type="button" key={period.value} title={period.value === "1s" ? "1-second candles · last 5 minutes" : undefined} aria-pressed={period.value === activeRange} disabled={!marketAvailable} onClick={() => setRange(period.value)}>{period.label}</button>)}</div>
          <div className={styles.chartToolbarOptions}>
            <span className={styles.segmented}><button className={chartMetric === "price" ? styles.selectedControl : ""} type="button" onClick={() => setChartMetric("price")}>Price</button><button className={chartMetric === "marketCap" ? styles.selectedControl : ""} type="button" onClick={() => setChartMetric("marketCap")}>MC</button></span>
            <span className={styles.segmented}><button className={chartCurrency === "USD" ? styles.selectedControl : ""} type="button" disabled={!chartQuoteUsd} onClick={() => setChartCurrency("USD")}>USD</button><button className={chartCurrency === "ETH" ? styles.selectedControl : ""} type="button" onClick={() => setChartCurrency("ETH")}>ETH</button></span>
          </div>
        </div>
        <div className={styles.chartInstrument}><span className={styles.instrumentMark} aria-hidden="true">✳</span><strong>{symbol}</strong><span>· {activeRange}{activeRange === "1s" ? " · Last 5 min" : ""} · KORUM</span>{marketAvailable ? <span className={styles.instrumentLive}><i /> LIVE</span> : null}</div>
        <MarketCandlestickChart candles={candles} available={marketAvailable} loading={chartQuery.isPending && marketAvailable} error={chartQuery.isError && !chartQuery.data} metric={chartMetric} currency={chartCurrency} range={activeRange} intervalSeconds={latestPage?.intervalSeconds} windows={chartWindows} lastTradeTimestamp={latestPage?.lastTradeTimestamp} hasMore={chartQuery.hasNextPage} loadingOlder={chartQuery.isFetchingNextPage} onLoadOlder={() => void chartQuery.fetchNextPage({ cancelRefetch: false })} />
        </>}
      </div>
      <div className={styles.marketStats}>
        <div><StatIcon kind="market" /><span>Market cap<strong>{marketAvailable ? formatMarketValue(token.marketCap, currency) : "—"}</strong></span></div>
        <div><StatIcon kind="people" /><span>{token.traderCount != null ? "Traders" : "Holders"}<strong>{formatCount(token.traderCount ?? token.holders, marketAvailable)}</strong></span></div>
        <div><StatIcon kind="volume" /><span>Vol 24h<strong>{marketAvailable ? formatMarketValue(token.volume24h, currency) : "—"}</strong></span></div>
      </div>

      {marketAvailable && curveStatus !== 3 && token.graduationTargetEth != null && token.graduationTargetEth > 0 ? (
        <p className={styles.graduationTarget}>
          {token.graduationDisabled ? "Graduation disabled for this reopened curve." : curveStatus === 2 ? GRADUATING_MESSAGE : <>
            <strong>{(token.curveRealEth ?? 0).toLocaleString("en-US", { maximumFractionDigits: 6 })} / {token.graduationTargetEth.toLocaleString("en-US", { maximumFractionDigits: 6 })} ETH</strong> toward this side’s graduation to Uniswap.
          </>}
        </p>
      ) : null}
      <TokenTradePanel token={token} onStatus={onStatus} onCurveStatus={handleCurveStatus} />
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
    queryFn: async ({ signal }) => {
      const results = await Promise.all(candidates.map(async (token) => {
        const response = await fetch(`/api/markets/${token.address}/trades?limit=30`, { signal, cache: "no-store" });
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

  if (trades === null) return <EmptyIndexedPanel title="Loading activity">Loading recent trades.</EmptyIndexedPanel>;
  if (trades.length === 0) return <EmptyIndexedPanel title="No activity yet">Trades will appear here once trading begins.</EmptyIndexedPanel>;

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
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/versus/${versusId}/positions`, { credentials: "same-origin", signal });
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
  if (positionsQuery.isLoading) return <EmptyIndexedPanel title="Loading your positions">Checking your token balances.</EmptyIndexedPanel>;
  if (positionsQuery.isError) return <EmptyIndexedPanel title="Positions temporarily unavailable">Your positions could not be loaded. Please try again shortly.</EmptyIndexedPanel>;
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
    return <>
      <div className={styles.creatorPanel}>
        <span className={styles.creatorAvatar}><ProfileAvatar address={debate.creatorAddress || ""} className="profile-avatar-round" /></span>
        <div><span>Launched by · historical</span><strong>{debate.creatorName || shortAddress(debate.creatorAddress)}</strong><small>{debate.creatorAddress}</small></div>
        {debate.creatorAddress ? <button type="button" onClick={() => copyText(debate.creatorAddress!).then(() => onStatus("Launcher wallet copied.")).catch(() => onStatus("Unable to access the clipboard."))}><CopyIcon /> Copy wallet</button> : null}
      </div>
      <CreatorFeeTransfer versusId={debate.id} socialsJson={debate.socialsJson} camps={[
        { name: debate.sideA, symbol: debate.tokenA?.symbol ?? debate.tokenASymbol ?? debate.sideA, address: debate.tokenA?.address, indexedRecipient: debate.feeRecipientA },
        { name: debate.sideB, symbol: debate.tokenB?.symbol ?? debate.tokenBSymbol ?? debate.sideB, address: debate.tokenB?.address, indexedRecipient: debate.feeRecipientB },
      ]} />
    </>;
  }

  if (tab === "activity") return <MarketActivity debate={debate} tokenFilter={tokenFilter} />;
  if (tab === "positions") return <MyPositions versusId={debate.id} quoteUsd={debate.quoteUsd} />;

  const messages: Record<Exclude<InfoTab, "community" | "creator">, { title: string; body: string }> = {
    activity: { title: "No activity yet", body: "Trades will appear here once trading begins." },
    holders: { title: "Holder distribution unavailable", body: "Holder information is not available yet." },
    traders: { title: "Trader rankings unavailable", body: "Trader rankings are not available yet." },
    bubble: { title: "Ownership bubble map unavailable", body: "The ownership map is not available yet." },
    positions: { title: "No positions", body: "Your positions will appear here when available." },
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
  const [liveCampMarkets, setLiveCampMarkets] = useState<{ a: LiveCampMarket | null; b: LiveCampMarket | null }>({ a: null, b: null });
  const updateCampMarket = useCallback((side: "a" | "b", market: LiveCampMarket) => {
    setLiveCampMarkets((current) => {
      const previous = current[side];
      if (previous?.address === market.address && (previous.lastTradeTimestamp > market.lastTradeTimestamp || (previous.lastTradeTimestamp === market.lastTradeTimestamp && previous.marketCapEth === market.marketCapEth))) return current;
      return { ...current, [side]: market };
    });
  }, []);
  const debate = liveDebate.data ?? indexedDebate;
  const currentIndexedReadFailed = !debate && (indexedReadFailed || liveDebate.isError);

  if (!debate) {
    return <div className={styles.notFound}><Link href="/explore">← Back to Explore</Link><h1>{currentIndexedReadFailed ? "Versus temporarily unavailable" : "Versus not found"}</h1><p>{currentIndexedReadFailed ? "The Versus could not be loaded. Please try again shortly." : "This Versus does not exist or is not available yet."}</p></div>;
  }

  const indexedTokenA: DebateToken = debate.tokenA ?? { name: debate.sideA, symbol: debate.tokenASymbol || debate.sideA, image: debate.imageA };
  const indexedTokenB: DebateToken = debate.tokenB ?? { name: debate.sideB, symbol: debate.tokenBSymbol || debate.sideB, image: debate.imageB };
  const liveCapA = usesKorumCandles(indexedTokenA.curveStatus) && liveCampMarkets.a?.address === indexedTokenA.address?.toLowerCase() ? liveCampMarkets.a?.marketCapEth ?? null : null;
  const liveCapB = usesKorumCandles(indexedTokenB.curveStatus) && liveCampMarkets.b?.address === indexedTokenB.address?.toLowerCase() ? liveCampMarkets.b?.marketCapEth ?? null : null;
  const tokenA = liveCapA === null ? indexedTokenA : { ...indexedTokenA, marketCapEth: liveCapA, marketCap: liveCapA * (debate.quoteUsd ?? 1) };
  const tokenB = liveCapB === null ? indexedTokenB : { ...indexedTokenB, marketCapEth: liveCapB, marketCap: liveCapB * (debate.quoteUsd ?? 1) };
  const marketAvailable = hasMarketData(debate);
  const tokenAMarketAvailable = hasTokenMarketData(tokenA);
  const tokenBMarketAvailable = hasTokenMarketData(tokenB);
  const capA = tokenA.marketCapEth;
  const capB = tokenB.marketCapEth;
  const sideAPercentage = marketAvailable && capA != null && capB != null && capA + capB > 0
    ? Math.round((capA / (capA + capB)) * 100)
    : marketAvailable ? Math.max(0, Math.min(100, debate.sideAPercentage ?? 50)) : 50;
  const sideBPercentage = 100 - sideAPercentage;
  const socialLinks = normalizeSocialLinks(socialLinksFromJson(debate.socialsJson ?? "{}"));
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
            <div className={styles.titleBlock}><h1><span className={sideAPercentage > 50 && marketAvailable ? styles.heroLeader : ""}>{debate.sideA}</span> <em>vs</em> <span className={sideBPercentage > 50 && marketAvailable ? styles.heroLeader : ""}>{debate.sideB}</span></h1></div>
            {socialLinks && Object.values(socialLinks).some(Boolean) ? <div className={styles.socialLinks} aria-label="Versus social links">
              {socialLinks.x ? <a className={styles.xLink} href={socialLinks.x} target="_blank" rel="noreferrer" aria-label="Open the Versus X account">𝕏</a> : null}
              {socialLinks.telegram ? <a className={styles.xLink} href={socialLinks.telegram} target="_blank" rel="noreferrer" aria-label="Open the Versus Telegram">TG</a> : null}
              {socialLinks.discord ? <a className={styles.xLink} href={socialLinks.discord} target="_blank" rel="noreferrer" aria-label="Open the Versus Discord">D</a> : null}
              {socialLinks.website ? <a className={styles.xLink} href={socialLinks.website} target="_blank" rel="noreferrer" aria-label="Open the Versus website">↗</a> : null}
            </div> : null}
            <div className={styles.heroActions}>
              <button className={`${styles.roundButton} ${starred ? styles.starred : ""}`} type="button" aria-pressed={starred} aria-label={starred ? "Remove from watchlist" : "Add to watchlist"} onClick={() => toggle(debate.id, `${debate.sideA} vs ${debate.sideB}`)}><StarIcon /></button>
              <button className={styles.actionButton} type="button" onClick={() => setStatusMessage("Market alerts are not available yet.")}><BellIcon /> New Alert</button>
              <div className={styles.shareMenuWrap}>
                <button className={styles.actionButton} type="button" aria-expanded={shareOpen} onClick={() => setShareOpen((open) => !open)}>Share <ShareIcon /></button>
                {shareOpen ? <div className={styles.shareMenu}><button type="button" onClick={copyLink}><CopyIcon /> Copy link</button><button type="button" onClick={shareOnX}>𝕏 Share on X</button><button type="button" onClick={share}><ExternalIcon /> More options</button></div> : null}
              </div>
            </div>
          </div>

          <div className={styles.metaRow}>
            <span className={styles.category}>{debate.category}</span>
            <span>·</span>
            <span>Launched {formatAge(debate.createdMinutesAgo)}</span>
            <span>·</span>
          <span className={styles.creatorMeta}><span>Created by</span><b>{debate.creatorName || shortAddress(debate.creatorAddress)}</b>{debate.creatorRankLabel ? <small>{debate.creatorRankLabel}</small> : null}{debate.creatorIsNew ? <small>New creator</small> : null}</span>
          </div>

          <PendingCreatorFeeNotice camps={[{ name: debate.sideA, token: debate.tokenA?.address }, { name: debate.sideB, token: debate.tokenB?.address }]} />

          <div className={styles.overview}>
            <div className={styles.meter} aria-label={`${sideAPercentage}% ${debate.sideA}, ${sideBPercentage}% ${debate.sideB}`}><span className={sideAPercentage > 50 && marketAvailable ? styles.meterLeading : ""} style={{ width: `${sideAPercentage}%` }} /><span className={sideBPercentage > 50 && marketAvailable ? styles.meterLeading : ""} style={{ width: `${sideBPercentage}%` }} /></div>
            <div className={styles.overviewLabels}><span className={sideAPercentage > 50 && marketAvailable ? styles.leadingPill : ""}>{debate.sideA} · {sideAPercentage}%</span><span className={sideBPercentage > 50 && marketAvailable ? styles.leadingPill : ""}>{debate.sideB} · {sideBPercentage}%</span></div>
          </div>

          <div className={styles.debateCopy}><h2>{marketPreferenceLabel(tokenA, tokenB, sideAPercentage, marketAvailable)}</h2></div>
          {!marketAvailable ? <div className={styles.dataNotice}><span /> Market activity will appear as trades are recorded.</div> : null}
        </div>
      </section>

      <section className={styles.content}>
        <div className={styles.wrap}>
          <div className={styles.panels}><TokenPanel token={tokenA} side="a" marketShare={sideAPercentage} marketAvailable={tokenAMarketAvailable} onMarketUpdate={updateCampMarket} onStatus={setStatusMessage} /><TokenPanel token={tokenB} side="b" marketShare={sideBPercentage} marketAvailable={tokenBMarketAvailable} onMarketUpdate={updateCampMarket} onStatus={setStatusMessage} /></div>

          <div className={styles.infoCard}>
            <div className={styles.infoTop}>
              <div className={styles.infoTabs} role="tablist" aria-label="Versus information">{INFO_TABS.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} className={activeTab === tab.id ? styles.activeTab : ""} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}</div>
              <div className={styles.tokenFilter} aria-label="Filter by camp"><button type="button" className={tokenFilter === "both" ? styles.activeTab : ""} onClick={() => setTokenFilter("both")}>Both</button><button type="button" className={tokenFilter === "a" ? styles.activeTab : ""} onClick={() => setTokenFilter("a")}>{symbolLabel(tokenA.symbol)}</button><button type="button" className={tokenFilter === "b" ? styles.activeTab : ""} onClick={() => setTokenFilter("b")}>{symbolLabel(tokenB.symbol)}</button></div>
            </div>
            <div className={styles.infoBody} role="tabpanel"><InfoPanel tab={activeTab} debate={debate} tokenFilter={tokenFilter} onStatus={setStatusMessage} /></div>
          </div>

        </div>
      </section>

      {statusMessage ? <button type="button" className={styles.toast} onClick={() => setStatusMessage("")}><strong>Korum</strong><span>{statusMessage}</span></button> : null}
    </div>
  );
}
