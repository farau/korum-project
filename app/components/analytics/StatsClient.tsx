"use client";

import React, { useEffect, useId, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useIndexedDebates } from "../../hooks/useIndexedMarkets";
import MetricGlyph from "./MetricGlyph";
import DesignIcon from "../DesignIcon";
import { VsTableView } from "../explore/VsTable";
import type { Debate } from "../../lib/debates";
import type { AnalyticsPeriod, AnalyticsSnapshot } from "../../lib/analytics";

const chartWeek = [32, 48, 41, 59, 73, 67, 86];
const labelsWeek = ["M", "T", "W", "T", "F", "S", "S"];
const categoryColors = ["#00A1FD", "#D794F3", "#F3D8AD", "#9DDA72", "#07CCC3", "#58E877", "#FF453A"];
const emptyDebates: Debate[] = [];
const ANALYTICS_REFRESH_MS = 5 * 60 * 1_000;
const ANALYTICS_CACHE_MS = 10 * 60 * 1_000;

function combinedMarketCap(debate: Debate) {
  return (debate.tokenA?.marketCap ?? debate.marketCapA ?? 0)
    + (debate.tokenB?.marketCap ?? debate.marketCapB ?? 0);
}

function versusAgeLabel(debate: Debate) {
  const minutes = Math.max(0, Math.floor(debate.createdMinutesAgo));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

function annualRefreshInterval() {
  const now = new Date();
  const nextMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  return Math.min(ANALYTICS_REFRESH_MS, nextMonth - now.getTime() + 100);
}

function useCountUp(value: number) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let raf: number | null = null;
    const start = performance.now();
    const from = display;
    const duration = 700;
    const animate = (time: number) => {
      const progress = Math.min(1, (time - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (progress < 1) raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return display;
}

function formatCompact(value: number) {
  return Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: value > 999999 ? 2 : 1,
  }).format(value);
}

function formatMoney(value: number) {
  return `$${formatCompact(value)}`;
}

function formatAnalyticsMoney(valueUsd: number | null, valueEth: number) {
  return valueUsd === null ? `${valueEth.toLocaleString("en-US", { maximumFractionDigits: 5 })} ETH` : formatMoney(valueUsd);
}

function periodComparisonLabel(period: AnalyticsPeriod) {
  return period === "day" ? "vs previous day" : period === "week" ? "vs previous week" : "vs previous month";
}

function bucketLabel(timestamp: number, period: AnalyticsPeriod) {
  const date = new Date(timestamp * 1_000);
  return period === "day"
    ? new Intl.DateTimeFormat("en-US", { hour: "numeric", timeZone: "UTC" }).format(date)
    : period === "year"
    ? new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(date)
    : new Intl.DateTimeFormat("en-US", { weekday: "short", day: "numeric", timeZone: "UTC" }).format(date);
}

function AnalyticsIcon({ type = "trend" }: { type?: "trades" | "trend" | "bars" | "cash" | "bolt" | "users" | "wallet" }) {
  const paths = {
    trend: (
      <>
        <polyline points="3 17 9 11 13 15 21 7" />
        <polyline points="14 7 21 7 21 14" />
      </>
    ),
    bolt: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
    users: (
      <>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    wallet: (
      <>
        <rect x="2" y="6" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
        <circle cx="16" cy="15" r="1.4" />
      </>
    ),
  };

  return (
    <span className="analytics-stat-icon">
      <span className="spark spark1" />
      <span className="spark spark2" />
      {type === "cash" ? <DesignIcon name="cashout" /> : type === "wallet" ? <MetricGlyph type="cash" /> : type === "users" ? <DesignIcon name="users" /> : type === "bolt" ? <DesignIcon name="bolt" /> : type === "trades" || type === "bars" ? <MetricGlyph type={type} /> : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{paths[type]}</svg>
      )}
    </span>
  );
}

function BarChart({ values, labels, maxValue, currency = "USD" }: { values: number[]; labels: string[]; maxValue?: number; currency?: "USD" | "ETH" }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const tooltipId = useId();
  const max = Math.max(...values, 0);
  const chartMax = maxValue ?? max;
  const axisMax = maxValue ?? max * 12000;
  const formatValue = (value: number) => formatAnalyticsMoney(currency === "USD" ? value : null, value);
  const formatAmount = (value: number) => currency === "USD"
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
    : `${value.toLocaleString("en-US", { maximumFractionDigits: 8 })} ETH`;
  const active = activeIndex !== null && values[activeIndex] !== undefined ? activeIndex : null;
  return (
    <>
      <div className="analytics-chart-body">
        <div className="analytics-chart-bars">
          {values.map((value, index) => (
            <button
              type="button"
              className="analytics-chart-slot"
              key={`${value}-${index}`}
              aria-label={`${labels[index]}: ${formatAmount(value)}`}
              aria-describedby={active === index ? tooltipId : undefined}
              data-active={active === index}
              onPointerEnter={() => setActiveIndex(index)}
              onPointerLeave={() => setActiveIndex(null)}
              onFocus={() => setActiveIndex(index)}
              onBlur={() => setActiveIndex(null)}
              onClick={() => setActiveIndex(index)}
              onKeyDown={(event) => { if (event.key === "Escape") setActiveIndex(null); }}
            >
              <span
                className={`analytics-chart-bar ${value > 0 && value === max ? "peak" : ""}`}
                style={{ height: `${maxValue === undefined ? Math.max(8, value) : chartMax > 0 ? (value / chartMax) * 100 : 0}%`, transitionDelay: `${index * 45}ms` }}
              />
            </button>
          ))}
        </div>
        {active !== null ? <div id={tooltipId} role="tooltip" className="analytics-chart-tooltip" style={{ left: `clamp(75px, calc(${((active + 0.5) / values.length) * 100}% - ${((active + 0.5) / values.length) * 42}px), calc(100% - 75px))` }}>
          <span>{labels[active]}</span>
          <strong>{formatAmount(values[active])}</strong>
        </div> : null}
        <div className="analytics-chart-yaxis">
          <span>{formatValue(axisMax)}</span>
          <span>{formatValue(axisMax * 0.5)}</span>
          <span>{formatValue(0)}</span>
        </div>
      </div>
      <div className="analytics-chart-xaxis">
        {labels.map((label, index) => (
          <span key={`${label}-${index}`} data-active={active === index} onPointerEnter={() => setActiveIndex(index)} onPointerLeave={() => setActiveIndex(null)}>{label}</span>
        ))}
      </div>
    </>
  );
}

function StatCard({ value, label, icon }: { value: string; label: string; icon: React.ComponentProps<typeof AnalyticsIcon>["type"] }) {
  return (
    <div className="analytics-stat-card" data-metric={icon}>
      <AnalyticsIcon type={icon} />
      <span className="analytics-stat-text">
        <b>{value}</b>
        <span>{label}</span>
      </span>
    </div>
  );
}

export default function StatsClient() {
  const liveDebates = useIndexedDebates();
  const [period, setPeriod] = useState<AnalyticsPeriod>("day");
  const analyticsQuery = useQuery({
    queryKey: ["analytics", period],
    queryFn: async () => {
      const response = await fetch(`/api/analytics?period=${period}`);
      if (!response.ok) throw new Error("Analytics request failed.");
      return response.json() as Promise<AnalyticsSnapshot>;
    },
    staleTime: ANALYTICS_CACHE_MS,
    refetchInterval: ANALYTICS_REFRESH_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  const weeklyAnalyticsQuery = useQuery({
    queryKey: ["analytics", "week"],
    queryFn: async () => {
      const response = await fetch("/api/analytics?period=week");
      if (!response.ok) throw new Error("Weekly analytics request failed.");
      return response.json() as Promise<AnalyticsSnapshot>;
    },
    staleTime: ANALYTICS_CACHE_MS,
    refetchInterval: ANALYTICS_REFRESH_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  const annualAnalyticsQuery = useQuery({
    queryKey: ["analytics", "year"],
    queryFn: async () => {
      const response = await fetch("/api/analytics?period=year", { cache: "no-store" });
      if (!response.ok) throw new Error("Annual analytics request failed.");
      return response.json() as Promise<AnalyticsSnapshot>;
    },
    staleTime: 0,
    refetchInterval: annualRefreshInterval,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const src = liveDebates.data ?? emptyDebates;
  const totalVolume = src.reduce((sum, debate) => sum + debate.volume24h, 0);
  const trades = src.reduce((sum, debate) => sum + (debate.trades24h ?? 0), 0);
  const avgTrade = trades ? totalVolume / trades : 0;
  const analytics = analyticsQuery.data;
  const weeklyAnalytics = weeklyAnalyticsQuery.data;
  const annualAnalytics = annualAnalyticsQuery.data;
  const annualChartValues = annualAnalytics?.buckets.map((bucket) => bucket.volumeUsd ?? bucket.volumeEth) ?? [];
  const annualChartLabels = annualAnalytics?.buckets.map((bucket) => bucketLabel(bucket.timestamp, "year")) ?? [];
  const annualYear = annualAnalytics ? new Date(annualAnalytics.asOf * 1_000).getUTCFullYear() : null;
  const periodTrades = analytics?.trades ?? trades;
  const periodVolumeUsd = analytics?.volumeUsd ?? totalVolume;
  const periodAverageTradeUsd = analytics?.averageTradeUsd ?? avgTrade;
  const weeklyVolumeEth = weeklyAnalytics?.volumeEth ?? 0;
  const weeklyVolumeUsd = weeklyAnalytics?.volumeUsd;
  const weeklyChartValues = weeklyAnalytics?.buckets.map((bucket) => bucket.volumeUsd ?? bucket.volumeEth) ?? chartWeek;
  const weeklyChartLabels = weeklyAnalytics?.buckets.map((bucket) => bucketLabel(bucket.timestamp, "week")) ?? labelsWeek;
  const weeklyChartMax = weeklyAnalytics?.buckets.length ? Math.max(...weeklyChartValues, 0) : undefined;
  const comparisonLabel = periodComparisonLabel(period);

  const tradesDisplay = useCountUp(periodTrades);
  const volumeDisplay = useCountUp(periodVolumeUsd);
  const avgDisplay = useCountUp(periodAverageTradeUsd * 10) / 10;

  const categories = useMemo(() => {
    const totals = new Map<string, number>();
    src.forEach((debate) => totals.set(debate.category, (totals.get(debate.category) || 0) + debate.volume24h));
    const total = Math.max([...totals.values()].reduce((sum, volume) => sum + volume, 0), 1);
    const max = Math.max(...totals.values(), 1);
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, volume], index) => ({ name, volume, color: categoryColors[index % categoryColors.length], percentage: (volume / total) * 100, width: (volume / max) * 100 }));
  }, [src]);

  const topVs = useMemo(
    () =>
      [...src]
        .sort((a, b) => combinedMarketCap(b) - combinedMarketCap(a) || a.id - b.id)
        .slice(0, 8),
    [src],
  );

  return (
    <>
      <section className="info-section analytics-section-top">
        <div className="wrap">
          <div className="tac-card">
            <div className="tac-head">
              <div className="tac-head-left">
                <span className="tac-logo">
                  <DesignIcon name="trade" />
                </span>
                <div>
                  <h3>Trading analytics</h3>
                  <p>Overview of trading activity and performance.</p>
                </div>
              </div>
              <div className="tac-period-toggle">
                {(["day", "week", "month"] as const).map((item) => (
                  <button aria-pressed={period === item} className={`pill ${period === item ? "active" : ""}`} key={item} type="button" onClick={() => setPeriod(item)}>
                    {period === item && <span className="tac-period-spark" />}
                    {item === "day" ? "Daily" : item === "week" ? "Weekly" : "Monthly"}
                  </button>
                ))}
              </div>
            </div>

            <div className="tac-stats">
              <div className="tac-stat">
                <span className="tac-icon-tile"><AnalyticsIcon type="trades" /></span>
                <div className="tac-stat-text">
                  <span className="tac-stat-label">Number of trades</span>
                  <span className="tac-stat-value">{formatCompact(tradesDisplay)}</span>
                  <span className="tac-stat-change">↗ — <em>{comparisonLabel}</em></span>
                </div>
              </div>
              <div className="tac-divider" />
              <div className="tac-stat">
                <span className="tac-icon-tile"><AnalyticsIcon type="bars" /></span>
                <div className="tac-stat-text">
                  <span className="tac-stat-label">Trading volume</span>
                  <span className="tac-stat-value">{formatAnalyticsMoney(analytics?.volumeUsd ?? null, volumeDisplay)}</span>
                  <span className="tac-stat-change">↗ — <em>{comparisonLabel}</em></span>
                </div>
              </div>
              <div className="tac-divider" />
              <div className="tac-stat">
                <span className="tac-icon-tile"><AnalyticsIcon type="cash" /></span>
                <div className="tac-stat-text">
                  <span className="tac-stat-label">Average trade size</span>
                  <span className="tac-stat-value">{formatAnalyticsMoney(analytics?.averageTradeUsd ?? null, avgDisplay)}</span>
                  <span className="tac-stat-change">↗ — <em>{comparisonLabel}</em></span>
                </div>
              </div>
            </div>

            <div className="tac-foot">Data is updated nearly in real time and reflects the latest complete UTC day.</div>
          </div>

          <div className="analytics-panel">
            <div className="analytics-gauges">
              <div className="analytics-half">
                <div className="analytics-half-title">Annual{annualYear ? ` · ${annualYear}` : ""}</div>
                <div className="analytics-gauge-block">
                  <div className="analytics-chart-col">
                    <div className="analytics-chart-head">
                      <span className="gauge-value">{annualAnalytics ? formatAnalyticsMoney(annualAnalytics.volumeUsd, annualAnalytics.volumeEth) : "—"}</span>
                      <div className="analytics-vol24h">
                        <span className="vol24h-icon" aria-hidden="true"><MetricGlyph type="bars" /></span>
                        <span className="vol24h-text">
                          <span className="vol24h-label">Vol 24h</span>
                          <span className="vol24h-value">{formatMoney(totalVolume)}</span>
                        </span>
                      </div>
                    </div>
                    <BarChart values={annualChartValues} labels={annualChartLabels} maxValue={Math.max(...annualChartValues, 0)} currency={annualAnalytics?.volumeUsd == null ? "ETH" : "USD"} />
                    {annualAnalyticsQuery.isError ? <p role="status">Annual data is temporarily unavailable.</p> : annualAnalyticsQuery.isPending ? <p role="status">Loading annual data…</p> : null}
                  </div>
                  <div className="analytics-stat-cards">
                    <StatCard icon="bolt" value={annualAnalytics ? annualAnalytics.activeVersus.toString() : "—"} label="Active VS" />
                    <StatCard icon="users" value={annualAnalytics ? formatCompact(annualAnalytics.traders) : "—"} label="Traders" />
                    <StatCard icon="wallet" value={annualAnalytics ? formatAnalyticsMoney(annualAnalytics.feesUsd, annualAnalytics.feesEth) : "—"} label="Fees collected" />
                    <StatCard icon="cash" value={annualAnalytics ? formatAnalyticsMoney(annualAnalytics.creatorFeesUsd, annualAnalytics.creatorFeesEth) : "—"} label="Creator Fees" />
                  </div>
                </div>
              </div>

              <div className="analytics-half analytics-half-divider">
                <div className="analytics-half-title">Weekly</div>
                <div className="analytics-gauge-block">
                  <div className="analytics-chart-col">
                    <div className="analytics-chart-head">
                      <span className="gauge-value">{weeklyAnalytics ? formatAnalyticsMoney(weeklyVolumeUsd ?? null, weeklyVolumeEth) : "—"}</span>
                      <div className="analytics-vol24h">
                        <span className="vol24h-icon" aria-hidden="true"><MetricGlyph type="bars" /></span>
                        <span className="vol24h-text">
                          <span className="vol24h-label">Vol 24h</span>
                        <span className="vol24h-value">{formatMoney(totalVolume)}</span>
                        </span>
                      </div>
                    </div>
                    <BarChart values={weeklyChartValues} labels={weeklyChartLabels} maxValue={weeklyChartMax} currency={weeklyAnalytics && weeklyAnalytics.volumeUsd === null ? "ETH" : "USD"} />
                  </div>
                  <div className="analytics-stat-cards">
                    <StatCard icon="bolt" value={weeklyAnalytics ? weeklyAnalytics.activeVersus.toString() : "—"} label="Active VS" />
                    <StatCard icon="users" value={weeklyAnalytics ? formatCompact(weeklyAnalytics.traders) : "—"} label="Traders" />
                    <StatCard icon="wallet" value={weeklyAnalytics ? formatAnalyticsMoney(weeklyAnalytics.feesUsd, weeklyAnalytics.feesEth) : "—"} label="Fees collected (est.)" />
                    <StatCard icon="cash" value={weeklyAnalytics ? formatAnalyticsMoney(weeklyAnalytics.creatorFeesUsd, weeklyAnalytics.creatorFeesEth) : "—"} label="Creator Fees" />
                  </div>
                </div>
              </div>
            </div>
            <div className="analytics-panel-footer">
              <span className="live-dot" /> Data updated in real time
              <span className="sep">|</span>
              Last updated: <span>2 min ago</span>
            </div>
          </div>
        </div>
      </section>

      <section className="info-section">
        <div className="wrap">
          <div className="info-head">
            <span className="eyebrow">Breakdown</span>
            <h2>Volume by category</h2>
          </div>
          <div className="fee-bars">
            {categories.map((category) => (
              <div className="fee-bar-row2" key={category.name}>
                <span className="fee-bar-name"><span className="fee-bar-dot" style={{ background: category.color }} />{category.name}</span>
                <div className="fee-bar-track2">
                  <div className="fee-bar-fill2" style={{ width: `${category.width}%` }} />
                  <span className="fee-bar-percentage" style={{ left: `${category.width}%` }}>{category.percentage.toFixed(1)}%</span>
                </div>
                <span className="fee-bar-value"><span className="fee-bar-value-dot" />{formatMoney(category.volume)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="info-section analytics-bottom-section">
        <div className="wrap">
          <div className="info-head">
            <span className="eyebrow">Top VS</span>
            <h2>Largest market caps</h2>
          </div>
          {topVs.length ? (
            <VsTableView debates={topVs} ageLabel={versusAgeLabel} />
          ) : (
            <div className="explore-empty-versus" role="status">
              <p>{liveDebates.isPending ? "Loading top versus..." : liveDebates.isError ? "Top versus are temporarily unavailable." : "No versus available yet."}</p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
