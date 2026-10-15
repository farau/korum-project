export type AnalyticsPeriod = "day" | "week" | "month" | "year";

export type AnalyticsBucket = {
  timestamp: number;
  volumeEth: number;
  volumeUsd: number | null;
  trades: number;
};

export type AnalyticsSnapshot = {
  period: AnalyticsPeriod;
  asOf: number;
  trades: number;
  volumeEth: number;
  volumeUsd: number | null;
  averageTradeEth: number;
  averageTradeUsd: number | null;
  traders: number;
  activeVersus: number;
  feesEth: number;
  feesUsd: number | null;
  creatorFeesEth: number;
  creatorFeesUsd: number | null;
  buckets: AnalyticsBucket[];
};

const PERIOD_CONFIG = {
  day: { seconds: 24 * 60 * 60, bucketSeconds: 60 * 60 },
  week: { seconds: 7 * 24 * 60 * 60, bucketSeconds: 24 * 60 * 60 },
  month: { seconds: 30 * 24 * 60 * 60, bucketSeconds: 24 * 60 * 60 },
};

export function analyticsWindow(period: AnalyticsPeriod, now: Date) {
  const endSeconds = now.getTime() / 1_000;
  if (period === "year") {
    return { startSeconds: Date.UTC(now.getUTCFullYear(), 0, 1) / 1_000, endSeconds, bucketSeconds: null };
  }
  const config = PERIOD_CONFIG[period];
  return { startSeconds: endSeconds - config.seconds, endSeconds, bucketSeconds: config.bucketSeconds };
}

// Keep recorded months of this calendar year, plus the current (possibly empty) month.
export function annualBuckets(buckets: AnalyticsBucket[], now: Date, hasUsdQuote: boolean): AnalyticsBucket[] {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const byMonth = new Map<number, AnalyticsBucket>();
  for (const bucket of buckets) {
    const date = new Date(bucket.timestamp * 1_000);
    if (date.getUTCFullYear() !== year || date.getUTCMonth() > month) continue;
    byMonth.set(date.getUTCMonth(), { ...bucket, timestamp: Date.UTC(year, date.getUTCMonth(), 1) / 1_000 });
  }
  if (!byMonth.has(month)) {
    byMonth.set(month, { timestamp: Date.UTC(year, month, 1) / 1_000, volumeEth: 0, volumeUsd: hasUsdQuote ? 0 : null, trades: 0 });
  }
  return [...byMonth.values()].sort((a, b) => a.timestamp - b.timestamp);
}
