/**
 * Intraday order-book imbalance scanner — paper-trading defaults.
 * Alerts are dashboard-only; no live order placement.
 */
export const SCANNER_CONFIG = {
  dataMode: "order-book-imbalance" as const,
  provider: "upstox" as const,
  universe: "nse-fo-liquid" as const,
  alerts: "dashboard-only" as const,
  paperTradingOnly: true,

  /** |imbalance| at/above this → coloured bar (green / red). */
  barThreshold: 0.35,
  /** Soft zone (yellow / muted) between this and barThreshold. */
  softThreshold: 0.18,
  /** Minimum pending book size (bid+ask resting qty) to consider a signal. */
  minPendingBookQty: 500,
  /**
   * Price confirm is optional context only.
   * Bid-heavy always maps to bullish; ask-heavy always maps to bearish.
   */
  requirePriceConfirm: false,
  /** Cooldown between alerts for the same symbol (ms). */
  alertCooldownMs: 60_000,
  /** Max open paper positions at once. */
  maxOpenPositions: 5,
  /** Paper account equity (INR). */
  paperEquity: 100_000,
  /** Risk per new paper trade as fraction of equity. */
  riskPerTrade: 0.005,
  /** Initial stop distance as fraction of entry price. */
  stopPct: 0.004,
  /** Take-profit multiple of stop distance. */
  rewardMultiple: 2,
  /** Keep this many dashboard alerts. */
  maxAlerts: 40,
} as const;

export type ScannerConfig = typeof SCANNER_CONFIG;
