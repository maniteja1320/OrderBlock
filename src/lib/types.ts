export type Side = "bullish" | "bearish";

export interface StockMeta {
  symbol: string;
  name: string;
  sector: string;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StockQuote {
  symbol: string;
  name: string;
  sector: string;
  open: number;
  high: number;
  low: number;
  last: number;
  previousClose: number;
  changePct: number;
  volume: number;
  avgDailyMove: number;
  strength: number;
  side: Side | "neutral";
  upMove: number;
  downMove: number;
}

export interface RankedStock extends StockQuote {
  rank: number;
  rankChange: number;
  score: number;
}

export interface OrderBlockZone {
  side: Side;
  top: number;
  bottom: number;
  time: number;
  label: "Z";
  /** True once a later candle closes beyond the zone. */
  confirmed: boolean;
  isCurrent: boolean;
}

export interface FairValueGap {
  side: Side;
  top: number;
  bottom: number;
  time: number;
  endTime: number;
  filled: boolean;
}

export interface LevelMark {
  price: number;
  /** Band edges for chart zone drawing (liquidity / R levels). */
  top?: number;
  bottom?: number;
  /** Start time of this level segment (setup / swing candle). */
  time?: number;
  /** End time of segment (next setup, or session end). */
  endTime?: number;
  label: "S1" | "S2" | "R1" | "R2" | "L" | "Z";
  kind: "support" | "resistance" | "liquidity" | "invalidation";
  /** Swing high = resistance pool; swing low = support pool. */
  swing?: "high" | "low";
  /** True if a later candle has closed beyond this liquidity. */
  taken?: boolean;
  /** Label only the active/current setup on the chart. */
  isCurrent?: boolean;
}

export type BuildUpLabel =
  | "LONG BUILD-UP"
  | "SHORT BUILD-UP"
  | "SHORT COVERING"
  | "LONG UNWINDING"
  | "NEUTRAL";

export interface StockPopupStats {
  vwap: number | null;
  pctAboveVwap: number | null;
  oi: number | null;
  oiChangePct: number | null;
  buildUp: BuildUpLabel;
  riskReward: string | null;
  riskRewardRatio: number | null;
  conviction: number | null;
  rank: number | null;
  boardSize: number | null;
  percentile: number | null;
  isPick: boolean;
  boardSide: Side | null;
  rule: string;
}

/** OHLC-proxy smart-money tape (not exchange tick footprint). */
export interface SmartMoneyDetail {
  cvd: number;
  lastDelta: number;
  divergence: "none" | "bearish" | "bullish";
  relativeVolume: number;
  bigPrintCount: number;
  absorptionCount: number;
  score: number;
  bias: Side | "neutral";
  note: string;
  profile: {
    poc: number;
    vah: number;
    val: number;
    totalVolume: number;
    bins: Array<{
      price: number;
      volume: number;
      buyVol: number;
      sellVol: number;
    }>;
  } | null;
  bars: Array<{
    time: number;
    volume: number;
    delta: number;
    cvd: number;
    absorption: boolean;
    bigPrint: boolean;
  }>;
}

export interface SmartMoneyScanRow {
  symbol: string;
  name: string;
  sector: string;
  changePct: number;
  strength: number;
  side: Side | "neutral";
  score: number;
  bias: Side | "neutral";
  cvd: number;
  relativeVolume: number;
  bigPrintCount: number;
  absorptionCount: number;
  divergence: "none" | "bearish" | "bullish";
  poc: number | null;
  note: string;
}

export interface StockDetail {
  quote: StockQuote;
  candles: Candle[];
  zones: OrderBlockZone[];
  levels: LevelMark[];
  stats: StockPopupStats;
  smartMoney: SmartMoneyDetail;
}

export interface SectorFlow {
  sector: string;
  avgStrength: number;
  count: number;
  netSide: Side | "neutral";
}

export interface MarketBreadth {
  up: number;
  down: number;
  flat: number;
  total: number;
}

export interface RankingsResponse {
  updatedAt: string;
  marketStatus: MarketStatus;
  bullish: RankedStock[];
  bearish: RankedStock[];
  topPicks: RankedStock[];
  all: Array<{
    symbol: string;
    changePct: number;
    strength: number;
    side: Side | "neutral";
    sector: string;
  }>;
  sectors: SectorFlow[];
  breadth: MarketBreadth;
  leadingSector: SectorFlow | null;
  laggingSector: SectorFlow | null;
}

export type MarketStatus =
  | { state: "live"; label: string; asOf: string }
  | { state: "closed"; label: string; asOf: string }
  | { state: "preopen"; label: string; asOf: string }
  | { state: "holiday"; label: string; asOf: string };
