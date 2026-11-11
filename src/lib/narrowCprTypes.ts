/** Client-safe Intraday Narrow CPR types (no Node / Upstox imports). */

import type { MarketStatus } from "./types";

export interface NarrowCprRow {
  symbol: string;
  name: string;
  sector: string;
  /** Chartink: Daily close */
  price: number;
  /** Chartink: Daily volume */
  volume: number;
  /**
   * Chartink % change:
   * (Daily close − 1 day ago close) / 1 day ago close × 100
   */
  changePct: number;
  /** (TC − BC) / Pivot × 100 from prior day OHLC */
  cprWidthPct: number;
}

export interface NarrowCprResponse {
  updatedAt: string;
  marketStatus: MarketStatus;
  universe: number;
  scanned: number;
  rows: NarrowCprRow[];
  source: "upstox";
  error?: string;
}
