"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useSyncExternalStore } from "react";
import { DEPLOYMENT_CACHE_SCOPE } from "../config/deployment";
import type { PoolChart, TokenVenue } from "../lib/markets/venue";
import styles from "./VsDetailClient.module.css";

function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

function currentTheme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export default function GraduatedPoolChart({ tokenAddress, symbol }: { tokenAddress: string | null; symbol: string }) {
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, () => "dark");
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["pool-chart", DEPLOYMENT_CACHE_SCOPE, tokenAddress],
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/markets/${tokenAddress}/venue`, { signal, cache: "no-store" });
      if (!response.ok) throw new Error("Pool chart is temporarily unavailable.");
      return response.json() as Promise<TokenVenue & { chart: PoolChart | null }>;
    },
    enabled: Boolean(tokenAddress),
    staleTime: 30_000,
    refetchInterval: query => query.state.data?.chart?.status === "ready" || query.state.data?.chart?.status === "unsupported" ? false : 30_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  const chart = query.data?.chart;
  const embedUrl = chart?.embedUrl ? new URL(chart.embedUrl) : null;
  embedUrl?.searchParams.set("theme", theme);
  const themedUrl = embedUrl?.toString();
  const embedded = chart?.status === "ready" && themedUrl && failedUrl !== themedUrl;
  return <div className={styles.poolChart}>
    <div className={styles.chartInstrument}><strong>{symbol}</strong><span>· Uniswap v4</span>{embedded ? <span className={styles.instrumentLive}><i /> DEX SCREENER</span> : null}</div>
    {embedded ? <iframe
      className={styles.poolChartFrame}
      src={themedUrl}
      title={`${symbol} Uniswap chart on DEX Screener`}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailedUrl(themedUrl ?? null)}
    /> : <div className={styles.poolChartPending} role="status">
      <strong>{chart?.status === "unsupported" ? "Pool chart unavailable on testnet" : query.isError || failedUrl ? "Pool chart temporarily unavailable" : "Waiting for the DEX Screener chart"}</strong>
      <span>{chart?.status === "unsupported" ? "Migration is complete. Trading and market metrics remain available; DEX Screener charts are available on Robinhood mainnet." : "Migration is complete. Trading and market metrics remain available while the DEX Screener chart is being retrieved."}</span>
      {query.isError || failedUrl ? <button type="button" onClick={() => { setFailedUrl(null); void query.refetch(); }}>Retry chart</button> : null}
    </div>}
    {chart?.url ? <a className={styles.poolChartLink} href={chart.url} target="_blank" rel="noopener noreferrer">Open on DEX Screener ↗</a> : null}
  </div>;
}
