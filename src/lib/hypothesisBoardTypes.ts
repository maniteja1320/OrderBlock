/**
 * Client-safe Market Data board types (no Node / Upstox imports).
 */

import type { MarketStatus } from "./types";
import type { HypoScorerId } from "./scanner/hypoScorerIds";

export interface HypothesisRankRow {
  symbol: string;
  name: string;
  sector: string;
  side: "bull" | "bear";
  last: number;
  changePct: number;
  sectorChgPct: number;
  gapPct: number | null;
  volume: number;
  avgVolume20d: number | null;
  dist52wHighPct: number | null;
  dist52wLowPct: number | null;
  structure: string | null;
  obDistPct: number | null;
  fvg: string | null;
  liq: string | null;
  score: number;
  coverage: number;
  rank: number;
  rankChange: number;
  features: Record<string, number | null>;
}

export interface HypothesisBoardResponse {
  updatedAt: string;
  marketStatus: MarketStatus;
  source: "upstox";
  scorer: HypoScorerId;
  universe: number;
  quoted: number;
  candleSymbols: number;
  timeframe: string;
  lookback: number;
  droppedConstant: string[];
  uninformative: Record<string, string>;
  all: HypothesisRankRow[];
  bullish: HypothesisRankRow[];
  bearish: HypothesisRankRow[];
  error?: string;
}
