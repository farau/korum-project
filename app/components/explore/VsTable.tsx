"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Debate } from "../../lib/debates";
import { formatMarketValue } from "../../lib/markets/format";
import { useWatchlist } from "../../hooks/useWatchlist";

function Change({ value }: { value?: number }) {
  return value == null ? <span className="muted">—</span> : <span className={value >= 0 ? "buy" : "sell"}>{value >= 0 ? "+" : ""}{value.toFixed(1)}%</span>;
}

function TokenImage({ src, name }: { src?: string; name: string }) {
  const [failed, setFailed] = useState(false);
  return <span className="table-thumb">{src && !failed ? <Image src={src} alt="" fill sizes="28px" unoptimized onError={() => setFailed(true)} /> : name.slice(0, 1)}</span>;
}

type VsTableViewProps = {
  debates: Debate[];
  ageLabel: (debate: Debate) => string;
  isWatched: (id: number) => boolean;
  onWatchlistToggle: (id: number, label: string) => void;
};

export function VsTableView({ debates, ageLabel, isWatched, onWatchlistToggle }: VsTableViewProps) {
  return (
    <div className="vs-table-wrap" tabIndex={0} role="region" aria-label="Versus token market data">
        <table className="vs-table">
          <thead><tr>
            <th scope="col">VS</th><th scope="col">Token</th><th scope="col">Graph</th>
            {["MCap", "Age", "Vol 24h", "Traders", "5m", "1h", "6h", "24h"].map(label => <th scope="col" className="num" key={label}>{label}</th>)}
            <th scope="col"><span className="sr-only">Watchlist</span></th>
          </tr></thead>
          {debates.map(debate => (
            <tbody key={debate.id} className="table-matchup-group">
              {(["A", "B"] as const).map((side, index) => {
              const token = side === "A" ? debate.tokenA : debate.tokenB;
              const name = token?.name || (side === "A" ? debate.sideA : debate.sideB);
              const symbol = token?.symbol || (side === "A" ? debate.tokenASymbol : debate.tokenBSymbol) || name;
              const change = token?.change24h ?? (side === "A" ? debate.changeA24h : debate.changeB24h);
              const series = token?.priceHistory;
              const currency = debate.marketCurrency ?? "USD";
              const min = series?.length ? Math.min(...series) : 0;
              const range = series?.length ? Math.max(...series) - min || 1 : 1;
              return <tr className="table-token-row" key={side}>
                {index === 0 && <td className="col-matchup" rowSpan={2}>
                  <Link className="table-matchup-link" href={`/vs/${debate.id}`}>
                    <span className="table-matchup-tint" />
                    <span className="table-matchup-content">
                      <span className="pair-bolt" aria-hidden="true"><span className="pb-dot pb-dot1" /><span className="pb-dot pb-dot2" /><span className="pb-icon" /></span>
                      <span className="table-matchup-text"><span className="table-matchup-title">{debate.sideA} <span className="table-vs-sep">VS</span> {debate.sideB}</span><span className="table-vs-cat">{debate.category}</span></span>
                    </span>
                  </Link>
                </td>}
                <td><Link href={`/vs/${debate.id}`} className="table-vs-link"><TokenImage src={token?.image || token?.imageRef || (side === "A" ? debate.imageA : debate.imageB)} name={name} /><span className="table-vs-title">{symbol}</span></Link></td>
                <td>{series && series.length > 1 ? <svg className={`table-spark ${series[series.length - 1] >= series[0] ? "buy" : "sell"}`} viewBox="0 0 84 28" role="img" aria-label={`${name} price trend`}><polyline fill="none" stroke="currentColor" strokeWidth="1.4" points={series.map((value, i) => `${i * 84 / (series.length - 1)},${25 - (value - min) / range * 22}`).join(" ")} /></svg> : <span className="muted">—</span>}</td>
                <td className="num table-mcap">{formatMarketValue(token?.marketCap ?? (side === "A" ? debate.marketCapA : debate.marketCapB), currency, 1)}</td>
                <td className="num muted">{ageLabel(debate)}</td>
                <td className="num">{formatMarketValue(token?.volume24h, currency, 1)}</td>
                <td className="num">{token?.traderCount?.toLocaleString("en-US") ?? "—"}</td>
                <td className="num"><Change value={token?.change5m} /></td><td className="num"><Change value={token?.change1h} /></td><td className="num"><Change value={token?.change6h} /></td><td className="num"><Change value={change} /></td>
                {index === 0 && <td rowSpan={2} className="col-star"><button type="button" className={`table-star ${isWatched(debate.id) ? "active" : ""}`} aria-label={`${isWatched(debate.id) ? "Remove from" : "Add to"} watchlist: ${debate.sideA} vs ${debate.sideB}`} aria-pressed={isWatched(debate.id)} onClick={() => onWatchlistToggle(debate.id, `${debate.sideA} vs ${debate.sideB}`)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m12 2.5 3 6.5 7 .9-5.2 4.9 1.4 7-6.2-3.5-6.2 3.5 1.4-7L2 9.9l7-.9z" /></svg></button></td>}
              </tr>;
              })}
            </tbody>
          ))}
        </table>
    </div>
  );
}

export default function VsTable({ debates, ageLabel }: { debates: Debate[]; ageLabel: (debate: Debate) => string }) {
  const { has, toggle } = useWatchlist();
  return <VsTableView debates={debates} ageLabel={ageLabel} isWatched={has} onWatchlistToggle={toggle} />;
}
