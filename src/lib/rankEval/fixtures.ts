/**
 * Evaluation-only fixtures (not used by the scorer / ranking path).
 * Scorer code must never import these into production ranking logic.
 */

/** True top-10 labels for 2026-11-05 (order-block screen). */
export const TRUE_TOP10_2026_11_05 = {
  date: "2026-11-05",
  bullish: [
    "ASHOKLEY",
    "UNOMINDA",
    "AUROPHARMA",
    "PATANJALI",
    "INDIANB",
    "SUNPHARMA",
    "ANANDRATHI",
    "ICICIBANK",
    "BIOCON",
    "BAJAJFINSV",
  ],
  bearish: [
    "BHARATFORG",
    "PREMIERENE",
    "OIL",
    "GODREJCP",
    "NHPC",
    "NTPC",
    "SOLARINDS",
    "POWERGRID",
    "BEL",
    "LICI",
  ],
} as const;

export interface StructureCheck {
  symbol: string;
  event: "BOS" | "CHOCH";
  direction: "up" | "down";
  /** Expected event time HH:MM IST when known; null = any ~session. */
  timeApprox: string | null;
}

/** Structure calibration around 15:15 IST on the labeled session. */
export const STRUCTURE_CHECKS_2026_11_05: StructureCheck[] = [
  { symbol: "UNOMINDA", event: "BOS", direction: "up", timeApprox: null },
  { symbol: "PATANJALI", event: "BOS", direction: "up", timeApprox: null },
  { symbol: "MOTILALOFS", event: "CHOCH", direction: "up", timeApprox: null },
  { symbol: "ASHOKLEY", event: "CHOCH", direction: "down", timeApprox: "14:15" },
  { symbol: "BAJFINANCE", event: "CHOCH", direction: "down", timeApprox: "14:05" },
  { symbol: "BIOCON", event: "CHOCH", direction: "down", timeApprox: null },
];

export const FVG_CHECKS_2026_11_05 = [
  { symbol: "ASHOKLEY", expect: "inside" as const },
];
