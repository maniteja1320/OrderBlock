import type { Candle } from "./types";
import { toYahooSymbol } from "./symbols";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface YahooChartResult {
  timestamp?: number[];
  indicators?: {
    quote?: Array<{
      open?: Array<number | null>;
      high?: Array<number | null>;
      low?: Array<number | null>;
      close?: Array<number | null>;
      volume?: Array<number | null>;
    }>;
    adjclose?: Array<{
      adjclose?: Array<number | null>;
    }>;
  };
  meta?: {
    regularMarketPrice?: number;
    previousClose?: number;
    chartPreviousClose?: number;
    instrumentType?: string;
  };
}

async function fetchChart(
  symbol: string,
  interval: string,
  range: string,
): Promise<YahooChartResult | null> {
  const yahoo = toYahooSymbol(symbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    yahoo,
  )}?interval=${interval}&range=${range}&includePrePost=false`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
      },
      next: { revalidate: 0 },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      chart?: { result?: YahooChartResult[] };
    };
    return json.chart?.result?.[0] ?? null;
  } catch {
    return null;
  }
}

export function parseCandles(result: YahooChartResult | null): Candle[] {
  if (!result?.timestamp?.length) return [];
  const q = result.indicators?.quote?.[0];
  if (!q) return [];
  const adj = result.indicators?.adjclose?.[0]?.adjclose;
  const lastIdx = result.timestamp.length - 1;

  const candles: Candle[] = [];
  for (let i = 0; i < result.timestamp.length; i++) {
    const open = q.open?.[i];
    const high = q.high?.[i];
    const low = q.low?.[i];
    if (
      open == null ||
      high == null ||
      low == null ||
      !Number.isFinite(open) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low)
    ) {
      continue;
    }

    // Yahoo sometimes leaves the latest daily close null overnight after the
    // session; keep the bar using adjclose / last price / mid-range fallbacks.
    let close = q.close?.[i];
    if (close == null || !Number.isFinite(close)) {
      const adjClose = adj?.[i];
      if (adjClose != null && Number.isFinite(adjClose)) {
        close = adjClose;
      } else if (
        i === lastIdx &&
        result.meta?.regularMarketPrice != null &&
        Number.isFinite(result.meta.regularMarketPrice)
      ) {
        close = result.meta.regularMarketPrice;
      } else {
        close = (high + low) / 2;
      }
    }

    candles.push({
      time: result.timestamp[i],
      open,
      high,
      low,
      close,
      volume: q.volume?.[i] ?? 0,
    });
  }
  return candles;
}

export async function fetchIntraday1m(symbol: string): Promise<{
  candles: Candle[];
  previousClose: number;
  last: number;
}> {
  const result = await fetchChart(symbol, "1m", "1d");
  const candles = parseCandles(result);
  const previousClose =
    result?.meta?.previousClose ??
    result?.meta?.chartPreviousClose ??
    candles[0]?.open ??
    0;
  const last =
    result?.meta?.regularMarketPrice ??
    candles[candles.length - 1]?.close ??
    0;
  return { candles, previousClose, last };
}

export async function fetchDaily(symbol: string): Promise<Candle[]> {
  const result = await fetchChart(symbol, "1d", "3mo");
  return parseCandles(result);
}

/** In-memory daily history cache (SMA200 scans). Keyed by symbol + IST day. */
const dailyHistoryCache = new Map<
  string,
  { day: string; at: number; candles: Candle[] }
>();

function istDayKey(now = new Date()) {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/** ~1y daily bars — enough for SMA200; cached per IST day. */
export async function fetchDailyHistory(
  symbol: string,
  force = false,
): Promise<Candle[]> {
  const day = istDayKey();
  const hit = dailyHistoryCache.get(symbol);
  // Reuse same-day bars for up to 20 minutes (last bar still “live” enough for scan)
  if (
    !force &&
    hit &&
    hit.day === day &&
    Date.now() - hit.at < 20 * 60_000 &&
    hit.candles.length >= 200
  ) {
    return hit.candles;
  }

  const result = await Promise.race([
    fetchChart(symbol, "1d", "1y"),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 12_000)),
  ]);
  const candles = parseCandles(result);
  if (candles.length) {
    dailyHistoryCache.set(symbol, { day, at: Date.now(), candles });
  }
  return candles;
}

export async function fetchIntraday5m(symbol: string): Promise<Candle[]> {
  const result = await fetchChart(symbol, "5m", "5d");
  return parseCandles(result);
}

export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}
