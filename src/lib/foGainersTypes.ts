/** Client-safe F&O gainers types (no Node / Upstox imports). */

import type { MarketStatus } from "./types";

export interface FoGainerRow {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  /**
   * Chartink changeinpercentage:
   * ([0] 5 minute close − 1 day ago close) / 1 day ago close × 100
   */
  changePct: number;
}

export interface FoGainersResponse {
  updatedAt: string;
  marketStatus: MarketStatus;
  universe: number;
  scanned: number;
  rows: FoGainerRow[];
  source: "upstox";
  error?: string;
}
