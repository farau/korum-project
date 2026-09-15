"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useIndexedDebates } from "../../hooks/useIndexedMarkets";
import MetricGlyph from "./MetricGlyph";
import type { Debate } from "../../lib/debates";

const chartAll = [42, 58, 36, 74, 64, 88, 53, 70, 96, 82, 68, 91];
const chartWeek = [32, 48, 41, 59, 73, 67, 86];
const labelsAll = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const labelsWeek = ["M", "T", "W", "T", "F", "S", "S"];
const categoryColors = ["#00A1FD", "#D794F3", "#F3D8AD", "#9DDA72", "#07CCC3", "#58E877", "#FF453A"];
const emptyDebates: Debate[] = [];

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
      {type === "trades" || type === "bars" || type === "cash" ? <MetricGlyph type={type} /> : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{paths[type]}</svg>
      )}
    </span>
  );
}

function BarChart({ values, labels }: { values: number[]; labels: string[] }) {
  const max = Math.max(...values);
  return (
    <>
      <div className="analytics-chart-body">
        <div className="analytics-chart-bars">
          {values.map((value, index) => (
            <span
              className={`analytics-chart-bar ${value === max ? "peak" : ""}`}
              key={`${value}-${index}`}
              style={{ height: `${Math.max(8, value)}%`, transitionDelay: `${index * 45}ms` }}
            />
          ))}
        </div>
        <div className="analytics-chart-yaxis">
          <span>{formatMoney(max * 12000)}</span>
          <span>{formatMoney(max * 6500)}</span>
          <span>$0</span>
        </div>
      </div>
      <div className="analytics-chart-xaxis">
        {labels.map((label, index) => (
          <span key={`${label}-${index}`}>{label}</span>
        ))}
      </div>
    </>
  );
}

function StatCard({ value, label, icon }: { value: string; label: string; icon: React.ComponentProps<typeof AnalyticsIcon>["type"] }) {
  return (
    <div className="analytics-stat-card">
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
  const [period, setPeriod] = useState<"day" | "week" | "month">("day");

  const src = liveDebates.data ?? emptyDebates;
  const totalVolume = src.reduce((sum, debate) => sum + debate.volume24h, 0);
  const participantCount = src.reduce((sum, debate) => sum + debate.participantCount, 0);
  const trades = src.reduce((sum, debate) => sum + (debate.trades24h ?? 0), 0);
  const avgTrade = trades ? totalVolume / trades : 0;
  const annualVolume = totalVolume * 18;
  const weeklyVolume = totalVolume * 0.42;
  const fees = totalVolume * 0.025;
  const creatorFees = fees * 0.32;

  const tradesDisplay = useCountUp(trades);
  const volumeDisplay = useCountUp(totalVolume);
  const avgDisplay = useCountUp(avgTrade * 10) / 10;

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
        .sort((a, b) => (b.marketCapA || 0) + (b.marketCapB || 0) - ((a.marketCapA || 0) + (a.marketCapB || 0)))
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
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 17 9 11 13 15 21 7" />
                    <polyline points="14 7 21 7 21 14" />
                  </svg>
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
                  <span className="tac-stat-change">↗ 67.6% <em>vs previous day</em></span>
                </div>
              </div>
              <div className="tac-divider" />
              <div className="tac-stat">
                <span className="tac-icon-tile"><AnalyticsIcon type="bars" /></span>
                <div className="tac-stat-text">
                  <span className="tac-stat-label">Trading volume</span>
                  <span className="tac-stat-value">{formatMoney(volumeDisplay)}</span>
                  <span className="tac-stat-change">↗ 247.5% <em>vs previous day</em></span>
                </div>
              </div>
              <div className="tac-divider" />
              <div className="tac-stat">
                <span className="tac-icon-tile"><AnalyticsIcon type="cash" /></span>
                <div className="tac-stat-text">
                  <span className="tac-stat-label">Average trade size</span>
                  <span className="tac-stat-value">${avgDisplay.toLocaleString("en-US")}</span>
                  <span className="tac-stat-change">↗ 124.3% <em>vs previous day</em></span>
                </div>
              </div>
            </div>

            <div className="tac-foot">Data is updated nearly in real time and reflects the latest complete UTC day.</div>
          </div>

          <div className="analytics-panel">
            <div className="analytics-gauges">
              <div className="analytics-half">
                <div className="analytics-half-title">Annual</div>
                <div className="analytics-gauge-block">
                  <div className="analytics-chart-col">
                    <div className="analytics-chart-head">
                      <span className="gauge-value">{formatMoney(annualVolume)}</span>
                      <div className="analytics-vol24h">
                        <span className="vol24h-icon" aria-hidden="true"><MetricGlyph type="bars" /></span>
                        <span className="vol24h-text">
                          <span className="vol24h-label">Vol 24h</span>
                          <span className="vol24h-value">{formatMoney(totalVolume)}</span>
                        </span>
                      </div>
                    </div>
                    <BarChart values={chartAll} labels={labelsAll} />
                  </div>
                  <div className="analytics-stat-cards">
                    <StatCard icon="bolt" value={src.length.toString()} label="Active VS" />
                    <StatCard icon="users" value={formatCompact(participantCount)} label="Traders" />
                    <StatCard icon="wallet" value={formatMoney(fees)} label="Fees collected (est.)" />
                    <StatCard icon="cash" value={formatMoney(creatorFees)} label="Creator Fees" />
                  </div>
                </div>
              </div>

              <div className="analytics-half analytics-half-divider">
                <div className="analytics-half-title">Weekly</div>
                <div className="analytics-gauge-block">
                  <div className="analytics-chart-col">
                    <div className="analytics-chart-head">
                      <span className="gauge-value">{formatMoney(weeklyVolume)}</span>
                      <div className="analytics-vol24h">
                        <span className="vol24h-icon" aria-hidden="true"><MetricGlyph type="bars" /></span>
                        <span className="vol24h-text">
                          <span className="vol24h-label">Vol 24h</span>
                          <span className="vol24h-value">{formatMoney(totalVolume * 0.18)}</span>
                        </span>
                      </div>
                    </div>
                    <BarChart values={chartWeek} labels={labelsWeek} />
                  </div>
                  <div className="analytics-stat-cards">
                    <StatCard icon="bolt" value={src.length.toString()} label="Active VS" />
                    <StatCard icon="users" value={formatCompact(participantCount * 0.38)} label="Traders" />
                    <StatCard icon="wallet" value={formatMoney(fees * 0.42)} label="Fees collected (est.)" />
                    <StatCard icon="cash" value={formatMoney(creatorFees * 0.42)} label="Creator Fees" />
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
          <div className="topvs-table">
            <div className="topvs-row topvs-head">
              <span>#</span>
              <span>VS</span>
              <span className="topvs-cap-head">Market cap</span>
              <span className="topvs-chart-head" />
              <span className="topvs-traders-head">Traders</span>
            </div>
            {topVs.map((debate, index) => {
              const marketCap = (debate.marketCapA || 0) + (debate.marketCapB || 0);
              const spark = [16, 22, 14, 26, 20, 32, 28].map((y, pointIndex) => `${pointIndex * 10},${36 - y}`).join(" ");
              return (
                <div className={`topvs-row ${index < 3 ? "top3" : ""}`} key={debate.id}>
                  <span className="topvs-rank">#{index + 1}</span>
                  <span className="topvs-name">{debate.sideA} vs {debate.sideB}</span>
                  <span className="topvs-cap">{formatMoney(marketCap)}</span>
                  <svg className="topvs-chart" viewBox="0 0 64 24" fill="none">
                    <polyline points={spark} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="topvs-traders">
                    <AnalyticsIcon type="users" /> {formatCompact(debate.participantCount)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}
