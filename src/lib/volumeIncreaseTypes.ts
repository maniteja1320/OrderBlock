/** Client-safe Daily volume increase % types (no Node / Upstox imports). */

import type { MarketStatus } from "./types";

export interface VolumeIncreaseRow {
  symbol: string;
  name: string;
  sector: string;
  /** Session / daily volume */
  volume: number;
  /** 1 day ago SMA(Daily Volume, 20) */
  sma20: number;
  /**
   * Chartink Column1:
   * (Daily Volume − 1d-ago SMA20) / 1d-ago SMA20 × 100
   */
  increasePct: number;
}

export interface VolumeIncreaseResponse {
  updatedAt: string;
  marketStatus: MarketStatus;
  universe: number;
  scanned: number;
  rows: VolumeIncreaseRow[];
  source: "upstox";
  error?: string;
}
