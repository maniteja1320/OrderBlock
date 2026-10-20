import type { Candle, FairValueGap, Side } from "./types";

/**
 * Classic 3-candle fair value gap on finished bars.
 * Bullish: candle[i].low > candle[i-2].high  → gap [high[i-2], low[i]]
 * Bearish: candle[i].high < candle[i-2].low → gap [high[i], low[i-2]]
 *
 * Extends until a later candle fully fills the gap (trades through), or session end.
 */
export function detectFairValueGaps(candles: Candle[]): FairValueGap[] {
  if (candles.length < 3) return [];

  const gaps: FairValueGap[] = [];
  const sessionEnd = candles[candles.length - 1].time;

  for (let i = 2; i < candles.length; i++) {
    const c0 = candles[i - 2];
    const c2 = candles[i];

    let side: Side | null = null;
    let top = 0;
    let bottom = 0;

    if (c2.low > c0.high) {
      // Bullish imbalance (up move left a gap)
      side = "bullish";
      bottom = c0.high;
      top = c2.low;
    } else if (c2.high < c0.low) {
      // Bearish imbalance (down move left a gap)
      side = "bearish";
      bottom = c2.high;
      top = c0.low;
    }

    if (!side || top <= bottom) continue;

    // Start drawing from the middle (impulse) candle
    const startTime = candles[i - 1].time;
    let endTime = sessionEnd;
    let filled = false;

    for (let j = i + 1; j < candles.length; j++) {
      const c = candles[j];
      const fullyFilled =
        side === "bullish" ? c.low <= bottom : c.high >= top;
      if (fullyFilled) {
        endTime = c.time;
        filled = true;
        break;
      }
    }

    gaps.push({
      side,
      top,
      bottom,
      time: startTime,
      endTime,
      filled,
    });
  }

  // Keep unfilled first; cap noise (prefer recent + unfilled)
  const unfilled = gaps.filter((g) => !g.filled);
  const filled = gaps.filter((g) => g.filled).slice(-6);
  return [...unfilled, ...filled];
}
