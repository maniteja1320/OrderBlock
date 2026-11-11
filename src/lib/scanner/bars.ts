import { SCANNER_CONFIG } from "./config";

export type BarColor = "green" | "red" | "yellow" | "flat";

export interface ImbalanceBar {
  /** Pending-book imbalance in [-1, 1]. */
  imbalance: number;
  color: BarColor;
  /** 0–100 display width for the stronger side. */
  strengthPct: number;
  /** Green fill % of a dual bar (buy share of pending book). */
  greenPct: number;
  /** Red fill % of a dual bar (sell share of pending book). */
  redPct: number;
  label: string;
}

/**
 * Red/green bar from pending order-book quantities only.
 * Does NOT use executed trade volume (vtt/ltq).
 *
 * imbalance = (pendingBuy − pendingSell) / (pendingBuy + pendingSell)
 * greenPct  = pendingBuy / total   → bullish resting interest
 * redPct    = pendingSell / total  → bearish resting interest
 */
export function calcImbalanceBar(
  pendingBuyQty: number,
  pendingSellQty: number,
  cfg = SCANNER_CONFIG,
): ImbalanceBar {
  const buy = Math.max(0, pendingBuyQty);
  const sell = Math.max(0, pendingSellQty);
  const total = buy + sell;
  if (total <= 0) {
    return {
      imbalance: 0,
      color: "flat",
      strengthPct: 0,
      greenPct: 50,
      redPct: 50,
      label: "no book",
    };
  }

  const imbalance = (buy - sell) / total;
  const greenPct = (buy / total) * 100;
  const redPct = (sell / total) * 100;
  const strengthPct = Math.min(100, Math.abs(imbalance) * 100);

  let color: BarColor = "flat";
  let label = "balanced";
  if (imbalance >= cfg.barThreshold) {
    color = "green";
    label = "bid heavy";
  } else if (imbalance <= -cfg.barThreshold) {
    color = "red";
    label = "ask heavy";
  } else if (imbalance >= cfg.softThreshold) {
    color = "yellow";
    label = "bid lean";
  } else if (imbalance <= -cfg.softThreshold) {
    color = "yellow";
    label = "ask lean";
  }

  return {
    imbalance: +imbalance.toFixed(4),
    color,
    strengthPct: +strengthPct.toFixed(1),
    greenPct: +greenPct.toFixed(1),
    redPct: +redPct.toFixed(1),
    label,
  };
}
