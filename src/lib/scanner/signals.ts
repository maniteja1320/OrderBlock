import type { BookPressureTick } from "../upstox/marketDataFeed";
import { calcImbalanceBar, type ImbalanceBar } from "./bars";
import { SCANNER_CONFIG } from "./config";
import { sizePaperTrade, type PaperSizePlan } from "./paperRisk";

export type SignalSide = "LONG" | "SHORT" | "NONE";

export interface ScannerSignal {
  symbol: string;
  name: string;
  sector: string;
  side: SignalSide;
  reason: string;
  ltp: number;
  changePct: number;
  /** Resting / pending book (not trades). */
  pendingBuyQty: number;
  pendingSellQty: number;
  /** Executed session volume (not resting). */
  volumeTradedToday: number;
  lastTradeQty: number;
  bar: ImbalanceBar;
  paper: PaperSizePlan | null;
  at: number;
}

function pendingBuy(tick: BookPressureTick): number {
  return tick.totalBuyQty > 0 || tick.totalSellQty > 0
    ? tick.totalBuyQty
    : tick.bidQty;
}

function pendingSell(tick: BookPressureTick): number {
  return tick.totalBuyQty > 0 || tick.totalSellQty > 0
    ? tick.totalSellQty
    : tick.askQty;
}

/**
 * Signal rules (dashboard alerts only):
 * 1. Build red/green bar from pending bid/ask qty (tbq/tsq or depth).
 * 2. Ignore thin books (< minPendingBookQty).
 * 3. Bid-heavy (green) → LONG / bullish only — never bearish.
 * 4. Ask-heavy (red) → SHORT / bearish only — never bullish.
 * 5. Executed volume (vtt) is context only — never drives the bar colour.
 */
export function evaluateSignal(
  tick: BookPressureTick,
  cfg = SCANNER_CONFIG,
): ScannerSignal {
  const buy = pendingBuy(tick);
  const sell = pendingSell(tick);
  const bar = calcImbalanceBar(buy, sell, cfg);
  const bookSize = buy + sell;

  const base = {
    symbol: tick.symbol,
    name: tick.name,
    sector: tick.sector,
    ltp: tick.ltp,
    changePct: tick.changePct,
    pendingBuyQty: buy,
    pendingSellQty: sell,
    volumeTradedToday: tick.volumeTradedToday ?? 0,
    lastTradeQty: tick.lastTradeQty ?? 0,
    bar,
    at: tick.updatedAt,
  };

  if (bookSize < cfg.minPendingBookQty) {
    return {
      ...base,
      side: "NONE",
      reason: `thin pending book (${Math.round(bookSize)} < ${cfg.minPendingBookQty})`,
      paper: null,
    };
  }

  // Strict split: bid-heavy → bullish only; ask-heavy → bearish only.
  if (bar.color === "green" || bar.imbalance >= cfg.barThreshold) {
    return {
      ...base,
      side: "LONG",
      reason: `bid-heavy pending book (imb ${bar.imbalance.toFixed(2)})`,
      paper: sizePaperTrade({ entry: tick.ltp, side: "LONG" }),
    };
  }

  if (bar.color === "red" || bar.imbalance <= -cfg.barThreshold) {
    return {
      ...base,
      side: "SHORT",
      reason: `ask-heavy pending book (imb ${bar.imbalance.toFixed(2)})`,
      paper: sizePaperTrade({ entry: tick.ltp, side: "SHORT" }),
    };
  }

  return {
    ...base,
    side: "NONE",
    reason: bar.label,
    paper: null,
  };
}
