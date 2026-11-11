/** Client-safe Bull vs Bear types (no Node / Upstox imports). */

import type { MarketStatus } from "./types";

export interface BullVsBearResponse {
  updatedAt: string;
  marketStatus: MarketStatus;
  universe: number;
  scanned: number;
  bull: number;
  bear: number;
  flat: number;
  /** Bull − Bear */
  net: number;
  /** Bull / (Bull + Bear), 0–100 */
  bullPct: number;
  source: "upstox" | "yahoo";
  error?: string;
}
