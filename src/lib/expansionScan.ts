import {
  BEARISH_CONDITIONS,
  BULLISH_CONDITIONS,
} from "./expansionConditions";
import { getMarketStatus } from "./marketHours";
import { FO_STOCKS } from "./symbols";
import type { Candle, Side } from "./types";
import { fetchDailyHistory, mapPool } from "./yahoo";

export { BEARISH_CONDITIONS, BULLISH_CONDITIONS } from "./expansionConditions";

export type ExpansionCheckId =
  | "rangeVs7"
  | "candleColor"
  | "vsPrevClose"
  | "weeklyColor"
  | "monthlyColor"
  | "prevVolume"
  | "smaStack";

export interface ExpansionCheck {
  id: ExpansionCheckId;
  label: string;
  pass: boolean;
}

export interface ExpansionHit {
  symbol: string;
  name: string;
  sector: string;
  side: Side;
  last: number;
  changePct: number;
  checks: ExpansionCheck[];
}

export interface ExpansionSideResponse {
  updatedAt: string;
  marketStatus: ReturnType<typeof getMarketStatus>;
  scanned: number;
  side: Side;
  hits: ExpansionHit[];
  conditions: string[];
}

const sideCache = new Map<Side, { at: number; data: ExpansionSideResponse }>();
const sideInflight = new Map<Side, Promise<ExpansionSideResponse>>();

function rangeOf(c: Candle) {
  return Math.max(0, c.high - c.low);
}

function sma(closes: number[], period: number, endIdx: number): number | null {
  if (endIdx + 1 < period) return null;
  let sum = 0;
  for (let i = endIdx - period + 1; i <= endIdx; i++) sum += closes[i];
  return sum / period;
}

function istParts(tsSec: number) {
  const d = new Date(tsSec * 1000);
  const key = d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const [y, m, day] = key.split("-").map(Number);
  const utcNoon = Date.UTC(y, m - 1, day, 12, 0, 0);
  const dow = new Date(utcNoon).getUTCDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(utcNoon);
  monday.setUTCDate(monday.getUTCDate() + mondayOffset);
  const weekKey = monday.toISOString().slice(0, 10);
  const monthKey = `${y}-${String(m).padStart(2, "0")}`;
  return { dateKey: key, weekKey, monthKey };
}

function periodCandle(
  daily: Candle[],
  kind: "week" | "month",
): { open: number; close: number } | null {
  if (!daily.length) return null;
  const last = daily[daily.length - 1];
  const parts = istParts(last.time);
  const key = kind === "week" ? parts.weekKey : parts.monthKey;
  const bars = daily.filter((c) => {
    const p = istParts(c.time);
    return (kind === "week" ? p.weekKey : p.monthKey) === key;
  });
  if (!bars.length) return null;
  return { open: bars[0].open, close: bars[bars.length - 1].close };
}

function evaluateSide(daily: Candle[], side: Side): ExpansionCheck[] | null {
  if (daily.length < 210) return null;
  const i = daily.length - 1;
  const today = daily[i];
  const prev = daily[i - 1];
  if (!today || !prev) return null;

  const todayRange = rangeOf(today);
  let rangeVs7 = true;
  for (let k = 1; k <= 7; k++) {
    const bar = daily[i - k];
    if (!bar || !(todayRange > rangeOf(bar))) {
      rangeVs7 = false;
      break;
    }
  }

  const candleColor =
    side === "bullish" ? today.close > today.open : today.close < today.open;
  const vsPrevClose =
    side === "bullish" ? today.close > prev.close : today.close < prev.close;

  const week = periodCandle(daily, "week");
  const month = periodCandle(daily, "month");
  const weeklyColor = week
    ? side === "bullish"
      ? week.close > week.open
      : week.close < week.open
    : false;
  const monthlyColor = month
    ? side === "bullish"
      ? month.close > month.open
      : month.close < month.open
    : false;

  const prevVolume = prev.volume > 10_000;

  const closes = daily.map((c) => c.close);
  const s20 = sma(closes, 20, i);
  const s50 = sma(closes, 50, i);
  const s200 = sma(closes, 200, i);
  const smaStack =
    s20 != null && s50 != null && s200 != null
      ? side === "bullish"
        ? s20 > s50 && s50 > s200
        : s20 < s50 && s50 < s200
      : false;

  const colorVerb = side === "bullish" ? ">" : "<";
  return [
    { id: "rangeVs7", label: "Range > prior 7 days", pass: rangeVs7 },
    { id: "candleColor", label: `Close ${colorVerb} open`, pass: candleColor },
    {
      id: "vsPrevClose",
      label: `Close ${colorVerb} prior close`,
      pass: vsPrevClose,
    },
    {
      id: "weeklyColor",
      label: `Weekly close ${colorVerb} open`,
      pass: weeklyColor,
    },
    {
      id: "monthlyColor",
      label: `Monthly close ${colorVerb} open`,
      pass: monthlyColor,
    },
    { id: "prevVolume", label: "Prior vol > 10,000", pass: prevVolume },
    {
      id: "smaStack",
      label:
        side === "bullish" ? "SMA20 > SMA50 > SMA200" : "SMA20 < SMA50 < SMA200",
      pass: smaStack,
    },
  ];
}

function changePctFromDaily(daily: Candle[]): number {
  if (daily.length < 2) return 0;
  const today = daily[daily.length - 1];
  const prev = daily[daily.length - 2];
  if (!prev.close) return 0;
  return ((today.close - prev.close) / prev.close) * 100;
}

/**
 * Run bullish OR bearish conditions across all F&O names (on demand).
 */
export async function computeExpansionSideScan(
  side: Side,
  force = false,
): Promise<ExpansionSideResponse> {
  const now = Date.now();
  const cached = sideCache.get(side);
  if (!force && cached && now - cached.at < 5 * 60_000) return cached.data;

  const existing = sideInflight.get(side);
  if (existing) return existing;

  const job = (async () => {
    const started = Date.now();
    const results = await mapPool(FO_STOCKS, 16, async (meta) => {
      try {
        const daily = await fetchDailyHistory(meta.symbol, force);
        if (daily.length < 210) return null;
        const checks = evaluateSide(daily, side);
        if (!checks || !checks.every((c) => c.pass)) {
          return { scanned: true as const, hit: null };
        }
        return {
          scanned: true as const,
          hit: {
            symbol: meta.symbol,
            name: meta.name,
            sector: meta.sector,
            side,
            last: daily[daily.length - 1]?.close ?? 0,
            changePct: changePctFromDaily(daily),
            checks,
          } satisfies ExpansionHit,
        };
      } catch {
        return null;
      }
    });

    const hits: ExpansionHit[] = [];
    let scanned = 0;
    for (const pack of results) {
      if (!pack) continue;
      scanned += 1;
      if (pack.hit) hits.push(pack.hit);
    }

    if (side === "bullish") hits.sort((a, b) => b.changePct - a.changePct);
    else hits.sort((a, b) => a.changePct - b.changePct);

    const data: ExpansionSideResponse = {
      updatedAt: new Date().toISOString(),
      marketStatus: getMarketStatus(),
      scanned,
      side,
      hits,
      conditions: side === "bullish" ? BULLISH_CONDITIONS : BEARISH_CONDITIONS,
    };
    sideCache.set(side, { at: started, data });
    return data;
  })().finally(() => {
    sideInflight.delete(side);
  });

  sideInflight.set(side, job);
  return job;
}
