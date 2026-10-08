"use client";

import {
  CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, createChart,
  type CandlestickData, type HistogramData, type IChartApi, type ISeriesApi,
  type Time, type UTCTimestamp, type WhitespaceData,
} from "lightweight-charts";
import { useEffect, useRef, useState } from "react";

import { formatMarketValue, formatTokenPrice } from "../lib/markets/format";
import styles from "./VsDetailClient.module.css";

export type MarketChartCandle = {
  t: number; open: number; high: number; low: number; close: number;
  openMarketCap: number; highMarketCap: number; lowMarketCap: number; closeMarketCap: number;
  volumeQuote?: number; tradeCount?: number;
};

type ChartWindow = {
  start: number;
  end: number;
  priorPrice: number | null;
  priorMarketCap: number | null;
  priorPriceUp: boolean | null;
  priorMarketCapUp: boolean | null;
  priorTimestamp: number | null;
};

type SyntheticTick = {
  synthetic: true;
  t: number;
  price: number;
  marketCap: number;
  lastTradeTimestamp: number | null;
};
type PulseTarget = { time: UTCTimestamp; price: number; up: boolean };

type ChartProps = {
  candles: MarketChartCandle[];
  available: boolean;
  loading?: boolean;
  error?: boolean;
  metric: "price" | "marketCap";
  currency: "USD" | "ETH";
  range: string;
  intervalSeconds?: number;
  windows?: ChartWindow[];
  lastTradeTimestamp?: number | null;
  hasMore?: boolean;
  loadingOlder?: boolean;
  onLoadOlder?: () => void;
};

function cssColor(element: HTMLElement, variable: string, fallback: string) {
  return getComputedStyle(element).getPropertyValue(variable).trim() || fallback;
}

export default function MarketCandlestickChart({ candles, available, loading, error, metric, currency, range, intervalSeconds, windows, lastTradeTimestamp, hasMore, loadingOlder, onLoadOlder }: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const priceRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const previousRef = useRef<Array<CandlestickData<Time>>>([]);
  const viewKeyRef = useRef("");
  const followingRef = useRef(true);
  const loadRef = useRef({ hasMore, loadingOlder, onLoadOlder });
  const candleMapRef = useRef(new Map<number, MarketChartCandle>());
  const syntheticMapRef = useRef(new Map<number, SyntheticTick>());
  const pulseRef = useRef<HTMLSpanElement>(null);
  const pulseTargetRef = useRef<PulseTarget | null>(null);
  const pulseFrameRef = useRef<number | null>(null);
  const schedulePulseRef = useRef<() => void>(() => undefined);
  const [hovered, setHovered] = useState<MarketChartCandle | SyntheticTick | null>(null);
  const [following, setFollowing] = useState(true);
  useEffect(() => {
    loadRef.current = { hasMore, loadingOlder, onLoadOlder };
    candleMapRef.current = new Map(candles.map(candle => [candle.t, candle]));
  }, [candles, hasMore, loadingOlder, onLoadOlder]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const chart = createChart(container, {
      width: container.clientWidth, height: container.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: cssColor(container, "--text-3", "#85858d"),
        fontFamily: "var(--font-geist-mono), monospace", fontSize: 12,
      },
      grid: {
        vertLines: { color: cssColor(container, "--line-soft", "rgba(255,255,255,.06)") },
        horzLines: { color: cssColor(container, "--line-soft", "rgba(255,255,255,.06)") },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: cssColor(container, "--line", "rgba(255,255,255,.12)"),
        scaleMargins: { top: 0.13, bottom: 0.26 },
      },
      timeScale: {
        borderColor: cssColor(container, "--line", "rgba(255,255,255,.12)"),
        timeVisible: true, secondsVisible: false, rightOffset: 2, barSpacing: 8, minBarSpacing: 3,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    });
    const price = chart.addSeries(CandlestickSeries, {
      upColor: "#25d28a", downColor: "#ff6075", wickUpColor: "#25d28a", wickDownColor: "#ff6075",
      borderVisible: false, priceLineVisible: true, lastValueVisible: true,
    });
    const volume = chart.addSeries(HistogramSeries, {
      priceScaleId: "volume", priceLineVisible: false, lastValueVisible: false,
      priceFormat: { type: "volume" },
    });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.79, bottom: 0 } });
    chartRef.current = chart;
    priceRef.current = price;
    volumeRef.current = volume;
    const positionPulse = () => {
      pulseFrameRef.current = null;
      const pulse = pulseRef.current;
      const target = pulseTargetRef.current;
      if (!pulse || !target) {
        if (pulse) pulse.hidden = true;
        return;
      }
      const x = chart.timeScale().timeToCoordinate(target.time);
      const y = price.priceToCoordinate(target.price);
      if (x === null || y === null || x < 0 || x > container.clientWidth || y < 0 || y > container.clientHeight) {
        pulse.hidden = true;
        return;
      }
      pulse.style.left = `${x}px`;
      pulse.style.top = `${y}px`;
      pulse.dataset.direction = target.up ? "up" : "down";
      pulse.hidden = false;
    };
    const schedulePulse = () => {
      if (pulseFrameRef.current !== null) cancelAnimationFrame(pulseFrameRef.current);
      pulseFrameRef.current = requestAnimationFrame(positionPulse);
    };
    schedulePulseRef.current = schedulePulse;
    const onVisibleRange = (visible: { from: number; to: number } | null) => {
      schedulePulse();
      if (!visible || !previousRef.current.length) return;
      const atLatest = visible.to >= previousRef.current.length - 2;
      if (followingRef.current !== atLatest) {
        followingRef.current = atLatest;
        setFollowing(atLatest);
      }
      if (visible.from < 10 && previousRef.current.length > 20 && loadRef.current.hasMore && !loadRef.current.loadingOlder) loadRef.current.onLoadOlder?.();
    };
    const onCrosshair = (event: { time?: Time }) => {
      setHovered(typeof event.time === "number"
        ? candleMapRef.current.get(event.time) ?? syntheticMapRef.current.get(event.time) ?? null
        : null);
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(onVisibleRange);
    chart.subscribeCrosshairMove(onCrosshair);
    container.addEventListener("pointermove", schedulePulse);
    container.addEventListener("wheel", schedulePulse);
    const resize = new ResizeObserver(([entry]) => {
      chart.applyOptions({ width: Math.floor(entry.contentRect.width), height: Math.floor(entry.contentRect.height) });
      schedulePulse();
    });
    resize.observe(container);
    const applyTheme = () => chart.applyOptions({
      layout: { textColor: cssColor(container, "--text-3", "#85858d") },
      grid: {
        vertLines: { color: cssColor(container, "--line-soft", "rgba(255,255,255,.06)") },
        horzLines: { color: cssColor(container, "--line-soft", "rgba(255,255,255,.06)") },
      },
      rightPriceScale: { borderColor: cssColor(container, "--line", "rgba(255,255,255,.12)") },
      timeScale: { borderColor: cssColor(container, "--line", "rgba(255,255,255,.12)") },
    });
    const themeObserver = new MutationObserver(applyTheme);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      if (pulseFrameRef.current !== null) cancelAnimationFrame(pulseFrameRef.current);
      pulseFrameRef.current = null;
      schedulePulseRef.current = () => undefined;
      themeObserver.disconnect();
      resize.disconnect();
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onVisibleRange);
      chart.unsubscribeCrosshairMove(onCrosshair);
      container.removeEventListener("pointermove", schedulePulse);
      container.removeEventListener("wheel", schedulePulse);
      chart.remove();
      chartRef.current = null;
      priceRef.current = null;
      volumeRef.current = null;
      previousRef.current = [];
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const price = priceRef.current;
    const volume = volumeRef.current;
    if (!chart || !price || !volume) return;
    const formatter = (value: number) => metric === "marketCap"
      ? formatMarketValue(value, currency) : formatTokenPrice(value, currency);
    const timeFormatter = (time: Time) => typeof time !== "number" ? String(time)
      : new Intl.DateTimeFormat(undefined, intervalSeconds && intervalSeconds < 86400
        ? { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", ...(intervalSeconds < 60 ? { second: "2-digit" } : {}) }
        : { year: "numeric", month: "short", day: "numeric" }).format(new Date(time * 1000));
    price.applyOptions({ priceFormat: { type: "custom", formatter, minMove: 1e-12 } });
    chart.applyOptions({ localization: { priceFormatter: formatter, timeFormatter }, timeScale: { tickMarkFormatter: timeFormatter } });

    const data: Array<CandlestickData<Time>> = [];
    const volumes: Array<HistogramData<Time> | WhitespaceData<Time>> = [];
    const synthetic = new Map<number, SyntheticTick>();
    if (available && intervalSeconds && windows) {
      const real = new Map(candles.map(candle => [candle.t, candle]));
      const bars = new Map<number, CandlestickData<Time>>();
      const volumeBars = new Map<number, HistogramData<Time> | WhitespaceData<Time>>();
      let carriedUp: boolean | null = null;
      for (const window of [...windows].sort((a, b) => a.start - b.start)) {
        let lastPrice = window.priorPrice;
        let lastMarketCap = window.priorMarketCap;
        let lastTrade = window.priorTimestamp;
        let lastUp: boolean | null = (metric === "marketCap" ? window.priorMarketCapUp : window.priorPriceUp) ?? carriedUp;
        for (let t = window.start; t <= window.end; t += intervalSeconds) {
          const candle = real.get(t);
          if (candle) {
            bars.set(t, {
              time: t as UTCTimestamp,
              open: metric === "marketCap" ? candle.openMarketCap : candle.open,
              high: metric === "marketCap" ? candle.highMarketCap : candle.high,
              low: metric === "marketCap" ? candle.lowMarketCap : candle.low,
              close: metric === "marketCap" ? candle.closeMarketCap : candle.close,
            });
            volumeBars.set(t, {
              time: t as UTCTimestamp, value: candle.volumeQuote ?? 0,
              color: (metric === "marketCap"
                ? candle.closeMarketCap >= candle.openMarketCap
                : candle.close >= candle.open) ? "#25d28a55" : "#ff607555",
            });
            lastPrice = candle.close;
            lastMarketCap = candle.closeMarketCap;
            lastTrade = t;
            lastUp = metric === "marketCap"
              ? candle.closeMarketCap >= candle.openMarketCap
              : candle.close >= candle.open;
          } else if (lastPrice !== null && lastMarketCap !== null) {
            const value = metric === "marketCap" ? lastMarketCap : lastPrice;
            const tickColor = lastUp === null ? "#85858d77" : lastUp ? "#25d28a77" : "#ff607577";
            bars.set(t, {
              time: t as UTCTimestamp, open: value, high: value, low: value, close: value,
              color: tickColor, wickColor: tickColor, borderColor: tickColor,
            });
            volumeBars.set(t, { time: t as UTCTimestamp });
            synthetic.set(t, {
              synthetic: true, t, price: lastPrice, marketCap: lastMarketCap, lastTradeTimestamp: lastTrade,
            });
          }
        }
        carriedUp = lastUp;
      }
      data.push(...[...bars.values()].sort((a, b) => Number(a.time) - Number(b.time)));
      volumes.push(...[...volumeBars.values()].sort((a, b) => Number(a.time) - Number(b.time)));
    }
    syntheticMapRef.current = synthetic;
    const key = `${metric}:${currency}:${range}`;
    const sameView = viewKeyRef.current === key;
    const previous = previousRef.current;
    const visible = sameView ? chart.timeScale().getVisibleLogicalRange() : null;
    const oldLast = previous.at(-1)?.time;
    const incremental = sameView && previous.length > 0 && data.length >= previous.length
      && previous.slice(0, -1).every((point, index) => JSON.stringify(point) === JSON.stringify(data[index]))
      && oldLast === data[previous.length - 1]?.time;
    if (incremental) {
      for (const point of data.slice(previous.length - 1)) price.update(point);
      for (const point of volumes.slice(previous.length - 1)) volume.update(point);
    } else {
      price.setData(data);
      volume.setData(volumes);
      if (visible && previous.length && data.length) {
        const anchor = previous[Math.max(0, Math.min(previous.length - 1, Math.floor(visible.from)))].time;
        const newAnchor = data.findIndex(point => point.time === anchor);
        const oldAnchor = previous.findIndex(point => point.time === anchor);
        if (newAnchor >= 0) {
          const shift = newAnchor - oldAnchor;
          chart.timeScale().setVisibleLogicalRange({ from: visible.from + shift, to: visible.to + shift });
        }
      }
    }
    previousRef.current = data;
    viewKeyRef.current = key;
    if ((!sameView || previous.length === 0) && data.length) {
      followingRef.current = true;
      setFollowing(true);
      chart.timeScale().setVisibleLogicalRange({
        from: Math.max(0, data.length - (containerRef.current?.clientWidth ?? 500) / 8),
        to: data.length + 2,
      });
    } else if (sameView && followingRef.current && data.length && oldLast !== data.at(-1)?.time) {
      chart.timeScale().scrollToPosition(2, false);
    }
    const currentCandle = candles.at(-1);
    const currentWindow = windows?.[0];
    pulseTargetRef.current = available && currentCandle && currentCandle.t === currentWindow?.end
      ? {
          time: currentCandle.t as UTCTimestamp,
          price: metric === "marketCap" ? (currentCandle.closeMarketCap >= currentCandle.openMarketCap ? currentCandle.highMarketCap : currentCandle.lowMarketCap) : (currentCandle.close >= currentCandle.open ? currentCandle.high : currentCandle.low),
          up: metric === "marketCap" ? currentCandle.closeMarketCap >= currentCandle.openMarketCap : currentCandle.close >= currentCandle.open,
        }
      : null;
    schedulePulseRef.current();
  }, [available, candles, currency, intervalSeconds, metric, range, windows]);

  const value = (number: number) => metric === "marketCap"
    ? formatMarketValue(number, currency) : formatTokenPrice(number, currency);
  const detail = hovered ?? candles.at(-1);
  const syntheticDetail = detail && "synthetic" in detail ? detail : null;
  const realDetail = detail && !("synthetic" in detail) ? detail : null;
  const hasKnownPrice = windows?.some(window => window.priorPrice !== null && window.priorMarketCap !== null);
  return (
    <>
      <div className={styles.chartArea}>
        <div className={styles.lightweightChart} ref={containerRef} />
        <span className={styles.chartPulse} ref={pulseRef} aria-hidden="true" hidden />
        {!following && available ? <button className={styles.chartLiveButton} type="button" onClick={() => {
          followingRef.current = true;
          setFollowing(true);
          chartRef.current?.timeScale().scrollToRealTime();
        }}>● Live</button> : null}
        {available && hasMore && candles.length > 0 && candles.length <= 20 ? <button className={styles.chartOlderButton} type="button" disabled={loadingOlder} onClick={onLoadOlder}>{loadingOlder ? "Loading…" : "Older trades"}</button> : null}
        {!available ? <div className={styles.chartEmpty}><strong>Awaiting market data</strong><span>Price history will appear after the first trade.</span></div> : null}
        {available && (loading || error) ? <div className={styles.chartEmpty}><strong>{error ? "Chart unavailable" : "Loading chart…"}</strong><span>{error ? "The chart could not be loaded. Please try again shortly." : "Loading recent trades."}</span></div> : null}
        {available && !loading && !error && candles.length === 0 && !hasKnownPrice ? <div className={styles.chartEmpty}><strong>No trades yet</strong><span>Waiting for the first trade.</span></div> : null}
      </div>
      {available && syntheticDetail ? <div className={styles.chartLegend}>
        <span>{new Date(syntheticDetail.t * 1000).toLocaleString()}</span>
        <span>No trades · price unchanged at {value(metric === "marketCap" ? syntheticDetail.marketCap : syntheticDetail.price)}</span>
        {syntheticDetail.lastTradeTimestamp ? <span>Last trade {new Date(syntheticDetail.lastTradeTimestamp * 1000).toLocaleString()}</span> : null}
      </div> : available && realDetail ? <div className={styles.chartLegend}>
        <span>{new Date(realDetail.t * 1000).toLocaleString()}</span>
        <span>O {value(metric === "marketCap" ? realDetail.openMarketCap : realDetail.open)}</span>
        <span>H {value(metric === "marketCap" ? realDetail.highMarketCap : realDetail.high)}</span>
        <span>L {value(metric === "marketCap" ? realDetail.lowMarketCap : realDetail.low)}</span>
        <span>C {value(metric === "marketCap" ? realDetail.closeMarketCap : realDetail.close)}</span>
        <span>Vol {(realDetail.volumeQuote ?? 0).toLocaleString(undefined, { maximumFractionDigits: 4 })} ETH · {realDetail.tradeCount ?? 0} trades</span>
      </div> : available && !loading && !error && candles.length === 0 && hasKnownPrice ? <div className={styles.chartLegend}>
        <span>No trades in this period · last price unchanged{lastTradeTimestamp ? ` since ${new Date(lastTradeTimestamp * 1000).toLocaleString()}` : ""}</span>
      </div> : null}
    </>
  );
}
