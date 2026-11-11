import { SCANNER_CONFIG } from "./config";

export interface PaperSizeInput {
  entry: number;
  side: "LONG" | "SHORT";
  equity?: number;
  riskPerTrade?: number;
  stopPct?: number;
  rewardMultiple?: number;
}

export interface PaperSizePlan {
  side: "LONG" | "SHORT";
  entry: number;
  qty: number;
  stop: number;
  target: number;
  riskAmount: number;
  rewardAmount: number;
  stopPct: number;
  /** Always true in this app — never routes to a broker. */
  paperOnly: true;
  note: string;
}

/**
 * Fixed-fractional risk sizing for paper trades only.
 * qty = floor(riskAmount / (entry × stopPct)); no live orders.
 */
export function sizePaperTrade(input: PaperSizeInput): PaperSizePlan | null {
  const equity = input.equity ?? SCANNER_CONFIG.paperEquity;
  const riskPerTrade = input.riskPerTrade ?? SCANNER_CONFIG.riskPerTrade;
  const stopPct = input.stopPct ?? SCANNER_CONFIG.stopPct;
  const rewardMultiple =
    input.rewardMultiple ?? SCANNER_CONFIG.rewardMultiple;
  const entry = input.entry;

  if (!Number.isFinite(entry) || entry <= 0) return null;

  const riskAmount = equity * riskPerTrade;
  const stopDistance = entry * stopPct;
  if (stopDistance <= 0) return null;

  const qty = Math.max(1, Math.floor(riskAmount / stopDistance));
  const stop =
    input.side === "LONG"
      ? +(entry - stopDistance).toFixed(2)
      : +(entry + stopDistance).toFixed(2);
  const target =
    input.side === "LONG"
      ? +(entry + stopDistance * rewardMultiple).toFixed(2)
      : +(entry - stopDistance * rewardMultiple).toFixed(2);

  return {
    side: input.side,
    entry: +entry.toFixed(2),
    qty,
    stop,
    target,
    riskAmount: +riskAmount.toFixed(2),
    rewardAmount: +(riskAmount * rewardMultiple).toFixed(2),
    stopPct,
    paperOnly: true,
    note: "Paper only — not sent to any broker / Upstox order API.",
  };
}
