"use client";

import {
  ColorType,
  CrosshairMode,
  createChart,
  customSeriesDefaultOptions,
  type CustomData,
  type CustomSeriesWhitespaceData,
  type CustomSeriesOptions,
  type IChartApi,
  type ICustomSeriesPaneRenderer,
  type ICustomSeriesPaneView,
  type ISeriesApi,
  type PaneRendererCustomData,
  type Time,
  type UTCTimestamp,
  type WhitespaceData,
} from "lightweight-charts";
import { useEffect, useRef } from "react";

import { formatMarketValue, formatTokenPrice } from "../lib/markets/format";
import styles from "./VsDetailClient.module.css";

export type MarketChartCandle = {
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
  openMarketCap: number;
  highMarketCap: number;
  lowMarketCap: number;
  closeMarketCap: number;
};

type MarketCandlestickChartProps = {
  candles: MarketChartCandle[];
  available: boolean;
  metric: "price" | "marketCap";
  currency: "USD" | "ETH";
  range: "1h" | "1d" | "7d" | "30d" | "180d";
  intervalSeconds?: number;
  windowStart?: number;
  windowEnd?: number;
};

type NarrowCandleData = CustomData<Time> & {
  open: number;
  high: number;
  low: number;
  close: number;
};

type NarrowCandleOptions = CustomSeriesOptions & {
  upColor: string;
  downColor: string;
  bodyWidth: number;
};

class NarrowCandleRenderer implements ICustomSeriesPaneRenderer {
  private data: PaneRendererCustomData<Time, NarrowCandleData> | null = null;
  private options: NarrowCandleOptions | null = null;

  update(data: PaneRendererCustomData<Time, NarrowCandleData>, options: NarrowCandleOptions) {
    this.data = data;
    this.options = options;
  }

  draw(target: Parameters<ICustomSeriesPaneRenderer["draw"]>[0], priceConverter: Parameters<ICustomSeriesPaneRenderer["draw"]>[1]) {
    if (!this.data?.visibleRange || !this.options) return;
    const { bars, visibleRange } = this.data;
    const options = this.options;

    target.useBitmapCoordinateSpace(({ context, horizontalPixelRatio, verticalPixelRatio }) => {
      const bodyWidth = Math.max(1, Math.round(options.bodyWidth * horizontalPixelRatio));
      const wickWidth = Math.max(1, Math.round(horizontalPixelRatio));

      for (let index = visibleRange.from; index < visibleRange.to; index += 1) {
        const bar = bars[index];
        if (!bar) continue;
        const candle = bar.originalData;
        const high = priceConverter(candle.high);
        const low = priceConverter(candle.low);
        const open = priceConverter(candle.open);
        const close = priceConverter(candle.close);
        if (high === null || low === null || open === null || close === null) continue;

        const x = Math.round(bar.x * horizontalPixelRatio);
        const highY = Math.round(high * verticalPixelRatio);
        const lowY = Math.round(low * verticalPixelRatio);
        const openY = Math.round(open * verticalPixelRatio);
        const closeY = Math.round(close * verticalPixelRatio);
        const color = candle.close >= candle.open ? options.upColor : options.downColor;

        context.fillStyle = color;
        context.fillRect(x - Math.floor(wickWidth / 2), highY, wickWidth, Math.max(1, lowY - highY));
        const bodyTop = Math.min(openY, closeY);
        const bodyHeight = Math.max(Math.round(2 * verticalPixelRatio), Math.abs(closeY - openY));
        context.fillRect(x - Math.floor(bodyWidth / 2), bodyTop, bodyWidth, bodyHeight);
      }
    });
  }
}

class NarrowCandleSeries implements ICustomSeriesPaneView<Time, NarrowCandleData, NarrowCandleOptions> {
  private readonly paneRenderer = new NarrowCandleRenderer();

  renderer() {
    return this.paneRenderer;
  }

  update(data: PaneRendererCustomData<Time, NarrowCandleData>, seriesOptions: NarrowCandleOptions) {
    this.paneRenderer.update(data, seriesOptions);
  }

  priceValueBuilder(candle: NarrowCandleData) {
    return [candle.high, candle.low, candle.close];
  }

  isWhitespace(data: NarrowCandleData | CustomSeriesWhitespaceData<Time>): data is CustomSeriesWhitespaceData<Time> {
    return !("open" in data);
  }

  defaultOptions(): NarrowCandleOptions {
    return {
      ...customSeriesDefaultOptions,
      color: "#25d28a",
      upColor: "#25d28a",
      downColor: "#ff6075",
      bodyWidth: 3,
    };
  }
}

function cssColor(element: HTMLElement, variable: string, fallback: string) {
  return getComputedStyle(element).getPropertyValue(variable).trim() || fallback;
}

export default function MarketCandlestickChart({ candles, available, metric, currency, range, intervalSeconds, windowStart, windowEnd }: MarketCandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Custom", Time, NarrowCandleData | WhitespaceData<Time>, NarrowCandleOptions> | null>(null);
  const visibleDataRef = useRef<{ key: string; lastTime: number | null }>({ key: "", lastTime: null });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: cssColor(container, "--text-3", "#85858d"),
        fontFamily: "var(--font-geist-mono), monospace",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: cssColor(container, "--line-soft", "rgba(255,255,255,.06)") },
        horzLines: { color: cssColor(container, "--line-soft", "rgba(255,255,255,.06)") },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: cssColor(container, "--line", "rgba(255,255,255,.12)"),
        scaleMargins: { top: 0.12, bottom: 0.12 },
      },
      timeScale: {
        borderColor: cssColor(container, "--line", "rgba(255,255,255,.12)"),
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 2,
        barSpacing: 3,
        minBarSpacing: 3,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    });
    const series = chart.addCustomSeries(new NarrowCandleSeries(), {
      color: "#25d28a",
      upColor: "#25d28a",
      downColor: "#ff6075",
      bodyWidth: 3,
      priceLineVisible: false,
      lastValueVisible: true,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const resize = new ResizeObserver(([entry]) => {
      chart.applyOptions({ width: Math.floor(entry.contentRect.width), height: Math.floor(entry.contentRect.height) });
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
      themeObserver.disconnect();
      resize.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;

    const formatter = (value: number) => metric === "marketCap"
      ? formatMarketValue(value, currency)
      : formatTokenPrice(value, currency);
    const timeFormatter = (time: Time) => {
      if (typeof time !== "number") return String(time);
      return new Intl.DateTimeFormat(undefined, range === "1h" || range === "1d"
        ? { hour: "2-digit", minute: "2-digit" }
        : { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
        .format(new Date(time * 1_000));
    };
    series.applyOptions({
      priceFormat: { type: "custom", formatter, minMove: 1e-12 },
    });
    chart.applyOptions({
      localization: { priceFormatter: formatter, timeFormatter },
      timeScale: { secondsVisible: false, tickMarkFormatter: timeFormatter },
    });

    const candleData = new Map(candles.map((candle) => [candle.t, candle]));
    const data: Array<NarrowCandleData | WhitespaceData<Time>> = [];
    if (available && candles.length > 0 && intervalSeconds && windowStart && windowEnd) {
      const firstBucket = Math.floor(windowStart / intervalSeconds) * intervalSeconds;
      for (let timestamp = firstBucket; timestamp <= windowEnd; timestamp += intervalSeconds) {
        const candle = candleData.get(timestamp);
        data.push(candle ? {
          time: timestamp as UTCTimestamp,
          open: metric === "marketCap" ? candle.openMarketCap : candle.open,
          high: metric === "marketCap" ? candle.highMarketCap : candle.high,
          low: metric === "marketCap" ? candle.lowMarketCap : candle.low,
          close: metric === "marketCap" ? candle.closeMarketCap : candle.close,
        } : { time: timestamp as UTCTimestamp });
      }
    } else if (available) {
      data.push(...candles.map((candle) => ({
        time: candle.t as UTCTimestamp,
        open: metric === "marketCap" ? candle.openMarketCap : candle.open,
        high: metric === "marketCap" ? candle.highMarketCap : candle.high,
        low: metric === "marketCap" ? candle.lowMarketCap : candle.low,
        close: metric === "marketCap" ? candle.closeMarketCap : candle.close,
      })));
    }
    series.setData(data);

    const key = `${metric}:${currency}:${range}`;
    const lastTime = candles.at(-1)?.t ?? null;
    if (data.length > 0 && (visibleDataRef.current.key !== key || visibleDataRef.current.lastTime === null || lastTime !== visibleDataRef.current.lastTime)) {
      if (windowStart && windowEnd) {
        chart.timeScale().setVisibleRange({ from: windowStart as UTCTimestamp, to: windowEnd as UTCTimestamp });
      } else {
        chart.timeScale().applyOptions({ barSpacing: 3, rightOffset: 2 });
        chart.timeScale().scrollToRealTime();
      }
    }
    visibleDataRef.current = { key, lastTime };
  }, [available, candles, currency, intervalSeconds, metric, range, windowEnd, windowStart]);

  return (
    <div className={styles.chartArea}>
      <div className={styles.lightweightChart} ref={containerRef} />
      {!available ? <div className={styles.chartEmpty}><strong>Awaiting market data</strong><span>Price history will appear after trading events are indexed.</span></div> : null}
      {available && candles.length === 0 ? <div className={styles.chartEmpty}><strong>No trades in this period</strong><span>Select a longer period or wait for the next indexed trade.</span></div> : null}
    </div>
  );
}
