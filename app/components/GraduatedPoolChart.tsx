"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { DEPLOYMENT_CACHE_SCOPE } from "../config/deployment";
import type { PoolChart, TokenVenue } from "../lib/markets/venue";
import styles from "./VsDetailClient.module.css";

export default function GraduatedPoolChart({ tokenAddress, symbol }: { tokenAddress: string | null; symbol: string }) {
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
  const embedded = chart?.status === "ready" && chart.embedUrl && failedUrl !== chart.embedUrl;
  return <div className={styles.poolChart}>
    <div className={styles.chartInstrument}><strong>{symbol}</strong><span>· Uniswap v4</span>{embedded ? <span className={styles.instrumentLive}><i /> DEX SCREENER</span> : null}</div>
    {embedded ? <iframe
      className={styles.poolChartFrame}
      src={chart.embedUrl!}
      title={`${symbol} Uniswap chart on DEX Screener`}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailedUrl(chart.embedUrl)}
    /> : <div className={styles.poolChartPending} role="status">
      <strong>{chart?.status === "unsupported" ? "Pool chart unavailable on testnet" : query.isError || failedUrl ? "Pool chart temporarily unavailable" : "Waiting for the Uniswap pool chart"}</strong>
      <span>{chart?.status === "unsupported" ? "DEX Screener charts are available on Robinhood mainnet." : "This token has graduated. Its chart will appear when DEX Screener indexes the pool."}</span>
      {query.isError || failedUrl ? <button type="button" onClick={() => { setFailedUrl(null); void query.refetch(); }}>Retry chart</button> : null}
    </div>}
    {chart?.url ? <a className={styles.poolChartLink} href={chart.url} target="_blank" rel="noopener noreferrer">Open on DEX Screener ↗</a> : null}
  </div>;
}
