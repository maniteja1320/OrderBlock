import type { Candle, Side, StockMeta, StockQuote } from "./types";

/**
 * Published OrderBlock-style strength:
 * strength = today's one-directional move from the open ÷ average daily move
 * One-sided only when travel on one side of open > 2× the other side.
 */
export function averageDailyMove(daily: Candle[], lookbackDays = 50): number {
  if (!daily.length) return 0;
  const slice = daily.slice(-lookbackDays);
  const ranges = slice
    .map((c) => Math.abs(c.high - c.low))
    .filter((r) => r > 0);
  if (!ranges.length) return 0;
  return ranges.reduce((a, b) => a + b, 0) / ranges.length;
}

export function computeStrengthFromSession(
  open: number,
  high: number,
  low: number,
  last: number,
  avgDailyMove: number,
): { strength: number; side: Side | "neutral"; upMove: number; downMove: number } {
  if (!open || !avgDailyMove || avgDailyMove <= 0) {
    return { strength: 0, side: "neutral", upMove: 0, downMove: 0 };
  }

  const upMove = Math.max(0, high - open);
  const downMove = Math.max(0, open - low);

  // Clearly one-sided: one side > 2× the other
  if (upMove > 2 * downMove && last >= open) {
    const move = Math.max(0, last - open);
    return {
      strength: move / avgDailyMove,
      side: "bullish",
      upMove,
      downMove,
    };
  }

  if (downMove > 2 * upMove && last <= open) {
    const move = Math.max(0, open - last);
    return {
      strength: move / avgDailyMove,
      side: "bearish",
      upMove,
      downMove,
    };
  }

  return { strength: 0, side: "neutral", upMove, downMove };
}

export function buildQuote(
  meta: StockMeta,
  candles: Candle[],
  previousClose: number,
  last: number,
  avgDailyMove: number,
): StockQuote | null {
  if (!candles.length && !last) return null;

  const open = candles[0]?.open ?? last;
  const high = candles.length
    ? Math.max(...candles.map((c) => c.high))
    : last;
  const low = candles.length ? Math.min(...candles.map((c) => c.low)) : last;
  const price = last || candles[candles.length - 1]?.close || open;
  const volume = candles.reduce((s, c) => s + (c.volume || 0), 0);
  const base = previousClose || open;
  const changePct = base ? ((price - base) / base) * 100 : 0;

  const { strength, side, upMove, downMove } = computeStrengthFromSession(
    open,
    high,
    low,
    price,
    avgDailyMove,
  );

  return {
    symbol: meta.symbol,
    name: meta.name,
    sector: meta.sector,
    open,
    high,
    low,
    last: price,
    previousClose: base,
    changePct,
    volume,
    avgDailyMove,
    strength,
    side,
    upMove,
    downMove,
  };
}
