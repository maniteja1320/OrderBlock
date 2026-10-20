"use client";

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  createChart,
  TickMarkType,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type Time,
  type TickMarkFormatter,
} from "lightweight-charts";
import type { Candle, LevelMark, OrderBlockZone, SmartMoneyDetail } from "@/lib/types";
import { KeyLevelPrimitive } from "./KeyLevelPrimitive";
import { OrderBlockPrimitive } from "./OrderBlockPrimitive";

interface Props {
  candles: Candle[];
  zones: OrderBlockZone[];
  levels: LevelMark[];
  vwap?: number | null;
  smartMoney?: SmartMoneyDetail | null;
  height?: number;
}

function toUnixSeconds(time: Time): number | null {
  if (typeof time === "number") return time;
  if (typeof time === "string") {
    const ms = Date.parse(time);
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
  }
  const utc = Date.UTC(time.year, time.month - 1, time.day);
  return Math.floor(utc / 1000);
}

function formatIst(time: Time, withSeconds = false): string {
  const unix = toUnixSeconds(time);
  if (unix == null) return "";
  return new Date(unix * 1000).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: withSeconds ? "2-digit" : undefined,
    hour12: false,
  });
}

function formatIstDate(time: Time): string {
  const unix = toUnixSeconds(time);
  if (unix == null) return "";
  return new Date(unix * 1000).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
  });
}

const istTickMarkFormatter: TickMarkFormatter = (time, tickMarkType) => {
  switch (tickMarkType) {
    case TickMarkType.Year:
      return new Date((toUnixSeconds(time) ?? 0) * 1000).toLocaleDateString(
        "en-IN",
        { timeZone: "Asia/Kolkata", year: "numeric" },
      );
    case TickMarkType.Month:
      return new Date((toUnixSeconds(time) ?? 0) * 1000).toLocaleDateString(
        "en-IN",
        { timeZone: "Asia/Kolkata", month: "short", year: "2-digit" },
      );
    case TickMarkType.DayOfMonth:
      return formatIstDate(time);
    case TickMarkType.Time:
    case TickMarkType.TimeWithSeconds:
    default:
      return formatIst(time);
  }
};

export function StockChart({
  candles,
  zones,
  levels,
  vwap = null,
  smartMoney = null,
  height = 360,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chartH = smartMoney?.bars.length ? Math.max(height, 480) : height;

    const chart: IChartApi = createChart(containerRef.current, {
      height: chartH,
      layout: {
        background: { color: "#0a0c10" },
        textColor:
          getComputedStyle(document.documentElement)
            .getPropertyValue("--muted")
            .trim() || "#8b93a7",
      },
      grid: {
        vertLines: { color: "rgba(128,128,128,0.08)" },
        horzLines: { color: "rgba(128,128,128,0.08)" },
      },
      rightPriceScale: { borderVisible: false },
      localization: {
        locale: "en-IN",
        timeFormatter: (time: Time) => `${formatIst(time)} IST`,
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: istTickMarkFormatter,
      },
      crosshair: { mode: 1 },
    });

    const series: ISeriesApi<"Candlestick"> = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    const data: CandlestickData<Time>[] = candles.map((c) => ({
      time: c.time as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    series.setData(data);

    const obPrimitive = new OrderBlockPrimitive();
    series.attachPrimitive(obPrimitive);
    obPrimitive.setZones(zones, data);

    const keyPrimitive = new KeyLevelPrimitive();
    series.attachPrimitive(keyPrimitive);
    keyPrimitive.setLevels(levels, data);

    if (vwap != null && Number.isFinite(vwap)) {
      series.createPriceLine({
        price: vwap,
        color: "#38bdf8",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "VWAP",
      });
    }

    const profile = smartMoney?.profile;
    if (profile) {
      series.createPriceLine({
        price: profile.poc,
        color: "rgba(245, 158, 11, 0.9)",
        lineWidth: 1,
        lineStyle: 0,
        axisLabelVisible: true,
        title: "POC",
      });
      series.createPriceLine({
        price: profile.vah,
        color: "rgba(148, 163, 184, 0.7)",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "VAH",
      });
      series.createPriceLine({
        price: profile.val,
        color: "rgba(148, 163, 184, 0.7)",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "VAL",
      });
    }

    if (smartMoney?.bars.length) {
      const volSeries = chart.addSeries(
        HistogramSeries,
        {
          priceFormat: { type: "volume" },
        },
        1,
      );
      volSeries.setData(
        smartMoney.bars.map((b) => ({
          time: b.time as Time,
          value: b.volume,
          color: b.bigPrint
            ? b.delta >= 0
              ? "rgba(34,197,94,0.95)"
              : "rgba(239,68,68,0.95)"
            : b.absorption
              ? "rgba(245,158,11,0.85)"
              : b.delta >= 0
                ? "rgba(34,197,94,0.45)"
                : "rgba(239,68,68,0.45)",
        })),
      );

      const cvdSeries = chart.addSeries(
        LineSeries,
        {
          color: "#a78bfa",
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
          title: "CVD",
        },
        2,
      );
      cvdSeries.setData(
        smartMoney.bars.map((b) => ({
          time: b.time as Time,
          value: b.cvd,
        })),
      );

      const panes = chart.panes();
      panes[0]?.setStretchFactor(0.6);
      panes[1]?.setStretchFactor(0.22);
      panes[2]?.setStretchFactor(0.18);
    }

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      series.detachPrimitive(obPrimitive);
      series.detachPrimitive(keyPrimitive);
      chart.remove();
    };
  }, [candles, zones, levels, vwap, smartMoney, height]);

  const chartH = smartMoney?.bars.length ? Math.max(height, 480) : height;
  return <div ref={containerRef} className="w-full" style={{ height: chartH }} />;
}
