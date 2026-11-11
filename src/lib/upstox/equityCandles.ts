import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { Candle } from "../types";
import { getIstClock } from "../marketHours";
import { loadFoEquityInstruments } from "./equityInstruments";

function getAccessToken(): string {
  const token = process.env.UPSTOX_ACCESS_TOKEN?.trim();
  if (!token) throw new Error("UPSTOX_ACCESS_TOKEN is not set.");
  return token;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function istDayKey(now = new Date()) {
  return getIstClock(now).date;
}

/** Upstox candle row → app Candle (unix seconds). */
export function parseUpstoxCandles(
  rows: Array<Array<string | number>>,
): Candle[] {
  const out: Candle[] = [];
  for (const row of rows) {
    const ts = String(row[0] ?? "");
    const t = Date.parse(ts);
    if (!Number.isFinite(t)) continue;
    const open = Number(row[1]);
    const high = Number(row[2]);
    const low = Number(row[3]);
    const close = Number(row[4]);
    const volume = Number(row[5] ?? 0);
    if (![open, high, low, close].every(Number.isFinite)) continue;
    out.push({
      time: Math.floor(t / 1000),
      open,
      high,
      low,
      close,
      volume: Number.isFinite(volume) ? volume : 0,
    });
  }
  return out.sort((a, b) => a.time - b.time);
}

async function fetchDayCandles(
  instrumentKey: string,
  fromDate: string,
  toDate: string,
): Promise<Candle[]> {
  const token = getAccessToken();
  const url = `https://api.upstox.com/v2/historical-candle/${encodeURIComponent(
    instrumentKey,
  )}/day/${toDate}/${fromDate}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    if (res.status === 429) {
      await sleep(700 * (attempt + 1));
      continue;
    }
    if (!res.ok) return [];
    const json = (await res.json()) as {
      data?: { candles?: Array<Array<string | number>> };
    };
    return parseUpstoxCandles(json.data?.candles ?? []);
  }
  return [];
}

const memDay = new Map<string, Candle[]>();

/** Daily OHLC+volume for one equity (cached in-memory for process life). */
export async function fetchEquityDayCandles(
  instrumentKey: string,
  days = 45,
): Promise<Candle[]> {
  const cacheKey = `${instrumentKey}|${days}|${istDayKey()}`;
  const hit = memDay.get(cacheKey);
  if (hit) return hit;

  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60_000);
  const toDate = to.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const fromDate = from.toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
  const candles = await fetchDayCandles(instrumentKey, fromDate, toDate);
  if (candles.length) memDay.set(cacheKey, candles);
  return candles;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  const n = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

export interface EquityCandleBundle {
  symbol: string;
  instrumentKey: string;
  daily: Candle[];
}

let dailyInflight: Promise<Map<string, Candle[]>> | null = null;
let dailyInflightKey: string | null = null;

/**
 * Load daily candles for the F&O equity universe (rate-limited).
 * Persists a light index under data/ for the IST day when possible.
 * Full-universe loads share one in-flight promise so Chartink + TradeFinder
 * don't double-crawl Upstox.
 */
export async function loadFoEquityDailyCandles(opts?: {
  force?: boolean;
  concurrency?: number;
  symbols?: string[];
  /** Calendar lookback when fetching from Upstox (default 45). */
  days?: number;
  /** Live board: never crawl Upstox — return disk (possibly partial) or empty. */
  diskOnly?: boolean;
}): Promise<Map<string, Candle[]>> {
  const force = opts?.force ?? false;
  const concurrency = opts?.concurrency ?? 4;
  const diskOnly = opts?.diskOnly ?? false;
  const days = opts?.days ?? 45;
  const scoped = Boolean(opts?.symbols?.length);
  const inflightKey = `all|${days}|${diskOnly ? 1 : 0}`;

  if (
    !force &&
    !scoped &&
    dailyInflight &&
    dailyInflightKey === inflightKey
  ) {
    return dailyInflight;
  }

  const run = (async (): Promise<Map<string, Candle[]>> => {
    const equities = await loadFoEquityInstruments(false);
    const wanted = opts?.symbols?.map((s) => s.toUpperCase()) ?? [
      ...equities.keys(),
    ];

    const dir = path.join(process.cwd(), "data", "hypo-daily");
    const day = istDayKey();
    const diskPath = path.join(
      dir,
      days === 45 ? `${day}.json` : `${day}-d${days}.json`,
    );

    type DiskShape = Record<
      string,
      Array<[number, number, number, number, number, number]>
    >;

    const map = new Map<string, Candle[]>();
    let disk: DiskShape = {};

    if (!force) {
      try {
        disk = JSON.parse(await readFile(diskPath, "utf8")) as DiskShape;
        for (const sym of wanted) {
          const rows = disk[sym];
          if (!rows?.length) continue;
          map.set(
            sym,
            rows.map(([time, open, high, low, close, volume]) => ({
              time,
              open,
              high,
              low,
              close,
              volume,
            })),
          );
        }
      } catch {
        disk = {};
      }
    }

    if (diskOnly) return map;

    // Fetch only missing names (or everything on force). Partial disk caches used
    // to return early and permanently skip symbols like KALYANKJIL.
    const jobs = wanted
      .filter((symbol) => force || !map.has(symbol))
      .map((symbol) => {
        const eq = equities.get(symbol);
        return eq ? { symbol, instrumentKey: eq.instrumentKey } : null;
      })
      .filter(Boolean) as Array<{ symbol: string; instrumentKey: string }>;

    if (jobs.length === 0) return map;

    const results = await mapPool(jobs, concurrency, async (job, i) => {
      if (i > 0 && i % concurrency === 0) await sleep(150);
      const daily = await fetchEquityDayCandles(job.instrumentKey, days);
      return { symbol: job.symbol, daily };
    });

    for (const r of results) {
      if (!r.daily.length) continue;
      map.set(r.symbol, r.daily);
      disk[r.symbol] = r.daily.map((c) => [
        c.time,
        c.open,
        c.high,
        c.low,
        c.close,
        c.volume,
      ]);
    }

    try {
      await mkdir(dir, { recursive: true });
      await writeFile(diskPath, JSON.stringify(disk), "utf8");
    } catch {
      /* non-fatal */
    }

    return map;
  })();

  if (!scoped) {
    dailyInflight = run;
    dailyInflightKey = inflightKey;
  }
  try {
    return await run;
  } finally {
    if (!scoped && dailyInflight === run) {
      dailyInflight = null;
      dailyInflightKey = null;
    }
  }
}

/** 20-session average volume excluding the current IST day when present. */
export function avgVolume20d(daily: Candle[], istDate = istDayKey()): number | null {
  const prior = daily.filter((c) => {
    const d = new Date(c.time * 1000).toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    });
    return d !== istDate && c.volume > 0;
  });
  const slice = prior.slice(-20);
  if (slice.length < 5) return null;
  const sum = slice.reduce((a, c) => a + c.volume, 0);
  return sum / slice.length;
}

export type IntradayInterval = "5minute" | "15minute" | "30minute";

function intervalToMinutes(interval: IntradayInterval): number {
  if (interval === "15minute") return 15;
  if (interval === "30minute") return 30;
  return 5;
}

async function fetchMinuteCandles(
  instrumentKey: string,
  interval: IntradayInterval,
  sessionDate: string,
): Promise<Candle[]> {
  const token = getAccessToken();
  const mins = intervalToMinutes(interval);
  // Upstox v3: /v3/historical-candle/{key}/minutes/{interval}/{to}/{from}
  const url = `https://api.upstox.com/v3/historical-candle/${encodeURIComponent(
    instrumentKey,
  )}/minutes/${mins}/${sessionDate}/${sessionDate}`;

  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    if (res.status === 429) {
      await sleep(1500 * (attempt + 1));
      continue;
    }
    if (!res.ok) return [];
    const json = (await res.json()) as {
      data?: { candles?: Array<Array<string | number>> };
    };
    return parseUpstoxCandles(json.data?.candles ?? []);
  }
  return [];
}

/**
 * Session intraday candles for F&O equities (cached under data/hypo-intraday/).
 * Prefer for structure / FVG / liq / OB (score_v2 expects these precomputed on 5m).
 */
export async function loadFoEquityIntradayCandles(opts: {
  interval?: IntradayInterval;
  sessionDate?: string;
  force?: boolean;
  concurrency?: number;
  symbols?: string[];
  /**
   * If true, never hit Upstox — return disk cache or empty.
   * Live Market Data uses this so ranking isn't blocked on a full 5m warm.
   */
  diskOnly?: boolean;
}): Promise<Map<string, Candle[]>> {
  const interval = opts.interval ?? "5minute";
  const sessionDate = opts.sessionDate ?? istDayKey();
  const force = opts.force ?? false;
  const concurrency = opts.concurrency ?? 2;
  const diskOnly = opts.diskOnly ?? false;
  const equities = await loadFoEquityInstruments(false);
  const wanted = opts.symbols?.map((s) => s.toUpperCase()) ?? [
    ...equities.keys(),
  ];

  const dir = path.join(process.cwd(), "data", "hypo-intraday");
  const diskPath = path.join(dir, `${sessionDate}-${interval}.json`);

  type DiskShape = Record<
    string,
    Array<[number, number, number, number, number, number]>
  >;

  const readDisk = async (): Promise<Map<string, Candle[]> | null> => {
    try {
      const raw = JSON.parse(await readFile(diskPath, "utf8")) as DiskShape;
      const map = new Map<string, Candle[]>();
      for (const sym of wanted) {
        const rows = raw[sym];
        if (!rows?.length) continue;
        map.set(
          sym,
          rows.map(([time, open, high, low, close, volume]) => ({
            time,
            open,
            high,
            low,
            close,
            volume,
          })),
        );
      }
      return map;
    } catch {
      return null;
    }
  };

  if (!force) {
    const cached = await readDisk();
    if (cached && cached.size >= Math.min(wanted.length, 20) * 0.5) {
      return cached;
    }
    if (diskOnly) return cached ?? new Map();
  } else if (diskOnly) {
    return (await readDisk()) ?? new Map();
  }

  const jobs = wanted
    .map((symbol) => {
      const eq = equities.get(symbol);
      return eq ? { symbol, instrumentKey: eq.instrumentKey } : null;
    })
    .filter(Boolean) as Array<{ symbol: string; instrumentKey: string }>;

  const results = await mapPool(jobs, concurrency, async (job, i) => {
    // Light pacing so Upstox doesn't throttle; concurrency handles throughput.
    if (i > 0 && i % concurrency === 0) await sleep(80);
    const bars = await fetchMinuteCandles(
      job.instrumentKey,
      interval,
      sessionDate,
    );
    return { symbol: job.symbol, bars };
  });

  const map = new Map<string, Candle[]>();
  const disk: DiskShape = {};
  for (const r of results) {
    if (!r.bars.length) continue;
    map.set(r.symbol, r.bars);
    disk[r.symbol] = r.bars.map((c) => [
      c.time,
      c.open,
      c.high,
      c.low,
      c.close,
      c.volume,
    ]);
  }

  try {
    await mkdir(dir, { recursive: true });
    await writeFile(diskPath, JSON.stringify(disk), "utf8");
  } catch {
    /* non-fatal */
  }

  return map;
}
