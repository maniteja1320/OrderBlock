/** Client-safe Near 52 week high types (no Node / Upstox imports). */

import type { MarketStatus } from "./types";

export interface Near52WeekHighRow {
  symbol: string;
  name: string;
  sector: string;
  /** Chartink: Daily close (ltp) */
  ltp: number;
  /** Chartink: Daily volume */
  volume: number;
  /**
   * Chartink % High:
   * (Daily Close − Daily Max(252, Daily high)) / Daily Max(252, Daily high) × 100
   * (0 at the high; negative when below)
   */
  pctHigh: number;
  /** 252-session max high used in % High */
  maxHigh252: number;
  /**
   * Chartink % change:
   * (Daily Close − 1 day ago close) / 1 day ago close × 100
   */
  changePct: number;
}

export interface Near52WeekHighResponse {
  updatedAt: string;
  marketStatus: MarketStatus;
  universe: number;
  scanned: number;
  rows: Near52WeekHighRow[];
  source: "upstox";
  error?: string;
}
