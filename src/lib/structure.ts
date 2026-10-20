import type { Candle, Side } from "./types";

export type StructureEvent = "BOS" | "CHOCH" | "NONE";

export interface StructureRead {
  event: StructureEvent;
  direction: "up" | "down" | null;
  /** HH:MM IST of the event candle when available. */
  timeLabel: string | null;
  eventTime: number | null;
  /** Nearest liquidity pool (last opposing swing). */
  liquidityPrice: number | null;
  liquiditySwept: boolean;
  /** % distance of last from liquidity / structure level. */
  distPct: number | null;
  displacement: boolean;
  bias: Side | "neutral";
}

function istTimeLabel(unix: number): string {
  return new Date(unix * 1000).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

interface Swing {
  i: number;
  time: number;
  price: number;
  kind: "high" | "low";
}

function swings(candles: Candle[]): Swing[] {
  const out: Swing[] = [];
  for (let i = 1; i < candles.length - 1; i++) {
    const c = candles[i];
    const l = candles[i - 1];
    const r = candles[i + 1];
    if (c.high >= l.high && c.high >= r.high) {
      out.push({ i, time: c.time, price: c.high, kind: "high" });
    }
    if (c.low <= l.low && c.low <= r.low) {
      out.push({ i, time: c.time, price: c.low, kind: "low" });
    }
  }
  return out;
}

/**
 * Lightweight BOS / CHOCH from 5m swings (SMC-style, OHLC only).
 * BOS = break of last structural high/low in trend direction.
 * CHOCH = first opposing break after an established trend.
 */
export function readStructure(candles: Candle[]): StructureRead {
  const empty: StructureRead = {
    event: "NONE",
    direction: null,
    timeLabel: null,
    eventTime: null,
    liquidityPrice: null,
    liquiditySwept: false,
    distPct: null,
    displacement: false,
    bias: "neutral",
  };
  if (candles.length < 8) return empty;

  const sw = swings(candles);
  const highs = sw.filter((s) => s.kind === "high");
  const lows = sw.filter((s) => s.kind === "low");
  if (highs.length < 2 || lows.length < 2) return empty;

  const last = candles[candles.length - 1];
  const open = candles[0].open;
  const dayBias: Side | "neutral" =
    last.close > open * 1.002
      ? "bullish"
      : last.close < open * 0.998
        ? "bearish"
        : "neutral";

  // Walk bars after second swing pair; track structure breaks
  let trend: "up" | "down" | null = null;
  let lastHigh = highs[0];
  let lastLow = lows[0];
  let event: StructureEvent = "NONE";
  let direction: "up" | "down" | null = null;
  let eventTime: number | null = null;
  let eventIdx = -1;

  let hiPtr = 0;
  let loPtr = 0;

  for (let i = 2; i < candles.length; i++) {
    while (hiPtr + 1 < highs.length && highs[hiPtr + 1].i <= i) {
      hiPtr += 1;
      lastHigh = highs[hiPtr];
    }
    while (loPtr + 1 < lows.length && lows[loPtr + 1].i <= i) {
      loPtr += 1;
      lastLow = lows[loPtr];
    }

    const c = candles[i];
    const brokeHigh = c.close > lastHigh.price;
    const brokeLow = c.close < lastLow.price;

    if (brokeHigh && !brokeLow) {
      if (trend === "down") {
        event = "CHOCH";
        direction = "up";
      } else {
        event = "BOS";
        direction = "up";
      }
      trend = "up";
      eventTime = c.time;
      eventIdx = i;
    } else if (brokeLow && !brokeHigh) {
      if (trend === "up") {
        event = "CHOCH";
        direction = "down";
      } else {
        event = "BOS";
        direction = "down";
      }
      trend = "down";
      eventTime = c.time;
      eventIdx = i;
    }
  }

  // Liquidity = last swing against trade direction
  const liquidity =
    direction === "up"
      ? lows[lows.length - 1]
      : direction === "down"
        ? highs[highs.length - 1]
        : dayBias === "bullish"
          ? lows[lows.length - 1]
          : highs[highs.length - 1];

  const liquiditySwept =
    liquidity.kind === "high"
      ? candles.slice(liquidity.i + 1).some((c) => c.close > liquidity.price)
      : candles.slice(liquidity.i + 1).some((c) => c.close < liquidity.price);

  const distPct =
    liquidity.price > 0
      ? ((last.close - liquidity.price) / liquidity.price) * 100
      : null;

  // Displacement: event bar range large vs recent average
  let displacement = false;
  if (eventIdx >= 0) {
    const ranges = candles
      .slice(Math.max(0, eventIdx - 12), eventIdx)
      .map((c) => c.high - c.low);
    const avg =
      ranges.reduce((a, b) => a + b, 0) / Math.max(1, ranges.length) || 0;
    const er = candles[eventIdx].high - candles[eventIdx].low;
    displacement = avg > 0 && er >= avg * 1.8;
  }

  const bias: Side | "neutral" =
    direction === "up"
      ? "bullish"
      : direction === "down"
        ? "bearish"
        : dayBias;

  return {
    event,
    direction,
    timeLabel: eventTime != null ? istTimeLabel(eventTime) : null,
    eventTime,
    liquidityPrice: liquidity.price,
    liquiditySwept,
    distPct,
    displacement,
    bias,
  };
}

/** Session % path from first open (for sector / index lines). */
export function pctPath(candles: Candle[]): Array<{ time: number; pct: number }> {
  if (!candles.length) return [];
  const o = candles[0].open;
  if (!o) return [];
  return candles.map((c) => ({
    time: c.time,
    pct: ((c.close - o) / o) * 100,
  }));
}
