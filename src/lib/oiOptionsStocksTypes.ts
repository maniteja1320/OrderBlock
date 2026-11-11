/** Client-safe Open Interest Options Stocks types (no Node / Upstox imports). */

import type { MarketStatus } from "./types";

export interface OiOptionsStockRow {
  symbol: string;
  name: string;
  sector: string;
  /** Chartink: Daily close */
  price: number;
  /** Chartink: Daily volume */
  volume: number;
  /**
   * Chartink % Change:
   * (Daily close − 1 day ago Close) / 1 day ago close × 100
   */
  changePct: number;
}

export interface OiOptionsStocksResponse {
  updatedAt: string;
  marketStatus: MarketStatus;
  universe: number;
  scanned: number;
  rows: OiOptionsStockRow[];
  source: "upstox";
  error?: string;
}
