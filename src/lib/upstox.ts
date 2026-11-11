import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { gunzipSync } from "zlib";
import { FO_STOCKS } from "./symbols";

const INSTRUMENTS_URL =
  "https://assets.upstox.com/market-quote/instruments/exchange/complete.json.gz";

export interface UpstoxInstrument {
  segment: string;
  instrument_type: string;
  instrument_key: string;
  trading_symbol: string;
  underlying_symbol?: string;
  expiry?: number;
  name?: string;
}

export interface UpstoxQuote {
  instrument_token?: string;
  last_price?: number;
  net_change?: number;
  /** Prior session close when provided by Upstox (prefer over ohlc.close). */
  prev_close_price?: number;
  oi?: number;
  oi_day_high?: number;
  oi_day_low?: number;
  volume?: number;
  ohlc?: {
    open?: number;
    high?: number;
    low?: number;
    /** Session close / last — NOT previous-day close on live quotes. */
    close?: number;
  };
}

interface FutContract {
  symbol: string;
  instrumentKey: string;
  expiry: number;
  tradingSymbol: string;
}

let instrumentsCache: { at: number; byUnderlying: Map<string, FutContract[]> } | null =
  null;
let prevOiCache: { day: string; values: Map<string, number> } | null = null;
/** Option 2 baseline: OI at first 5m bar of the IST session. */
let sessionOpenOiCache: { day: string; values: Map<string, number> } | null =
  null;

function getAccessToken(): string {
  const token = process.env.UPSTOX_ACCESS_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "UPSTOX_ACCESS_TOKEN is not set. Add it to .env.local (see .env.example).",
    );
  }
  return token;
}

function istDayKey(now = new Date()) {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

async function fetchJson<T>(
  url: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; data: T | null; text: string }> {
  const res = await fetch(url, {
    ...init,
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, status: res.status, data: null, text };
  }
  try {
    return { ok: true, status: res.status, data: JSON.parse(text) as T, text };
  } catch {
    return { ok: false, status: res.status, data: null, text };
  }
}

/** Nearest non-expired NSE stock future per FO underlying. */
export async function loadNearestFutures(
  force = false,
): Promise<Map<string, FutContract>> {
  const now = Date.now();
  if (
    !force &&
    instrumentsCache &&
    now - instrumentsCache.at < 6 * 60 * 60_000
  ) {
    return pickNearest(instrumentsCache.byUnderlying);
  }

  const res = await fetch(INSTRUMENTS_URL, {
    headers: {
      "User-Agent": "OrderBlock/1.0",
      Accept: "application/gzip, application/json, */*",
      "Accept-Encoding": "identity",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to download Upstox instruments (${res.status})`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const json = JSON.parse(gunzipSync(buf).toString("utf8")) as UpstoxInstrument[];

  const foSet = new Set(FO_STOCKS.map((s) => s.symbol.toUpperCase()));
  const byUnderlying = new Map<string, FutContract[]>();

  for (const row of json) {
    if (row.segment !== "NSE_FO" || row.instrument_type !== "FUT") continue;
    const und = (row.underlying_symbol || "").toUpperCase();
    if (!und || !foSet.has(und) || row.expiry == null) continue;
    const list = byUnderlying.get(und) ?? [];
    list.push({
      symbol: und,
      instrumentKey: row.instrument_key,
      expiry: row.expiry,
      tradingSymbol: row.trading_symbol,
    });
    byUnderlying.set(und, list);
  }

  instrumentsCache = { at: now, byUnderlying };
  return pickNearest(byUnderlying);
}

function pickNearest(
  byUnderlying: Map<string, FutContract[]>,
): Map<string, FutContract> {
  const now = Date.now();
  const out = new Map<string, FutContract>();
  for (const [sym, list] of byUnderlying) {
    const live = list
      .filter((c) => c.expiry > now)
      .sort((a, b) => a.expiry - b.expiry);
    const pick = live[0] ?? list.sort((a, b) => b.expiry - a.expiry)[0];
    if (pick) out.set(sym, pick);
  }
  return out;
}

let futQuoteCache: { at: number; key: string; data: Map<string, UpstoxQuote> } | null =
  null;
let futQuoteInflight: Promise<Map<string, UpstoxQuote>> | null = null;
let futQuoteInflightKey: string | null = null;
const FUT_QUOTE_CACHE_MS = 20_000;

/** Full market quotes — up to ~100 keys per request. Short TTL + inflight dedupe. */
export async function fetchFuturesQuotes(
  instrumentKeys: string[],
  force = false,
): Promise<Map<string, UpstoxQuote>> {
  const keys = [...instrumentKeys].sort();
  const cacheKey = keys.join(",");
  const now = Date.now();
  if (
    !force &&
    futQuoteCache &&
    futQuoteCache.key === cacheKey &&
    now - futQuoteCache.at < FUT_QUOTE_CACHE_MS
  ) {
    return futQuoteCache.data;
  }
  if (!force && futQuoteInflight && futQuoteInflightKey === cacheKey) {
    return futQuoteInflight;
  }

  const run = (async () => {
    const token = getAccessToken();
    const out = new Map<string, UpstoxQuote>();
    const chunkSize = 80;

    for (let i = 0; i < keys.length; i += chunkSize) {
      const chunk = keys.slice(i, i + chunkSize);
      const qs = chunk.map(encodeURIComponent).join(",");
      const url = `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${qs}`;
      const { ok, status, data, text } = await fetchJson<{
        status?: string;
        data?: Record<string, UpstoxQuote>;
      }>(url, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      if (!ok || !data?.data) {
        throw new Error(
          `Upstox quotes failed (${status}): ${text.slice(0, 180)}`,
        );
      }
      for (const [key, quote] of Object.entries(data.data)) {
        // Response keys may be trading symbols or instrument keys.
        out.set(key, quote);
        out.set(key.replace(/:/g, "|"), quote);
        if (quote.instrument_token) {
          out.set(quote.instrument_token, quote);
          out.set(quote.instrument_token.replace(/:/g, "|"), quote);
        }
      }
      // Ensure each requested key resolves even if response key casing differs.
      for (const requested of chunk) {
        if (out.has(requested)) continue;
        for (const [key, quote] of out) {
          if (
            key === requested ||
            quote.instrument_token === requested ||
            quote.instrument_token?.replace(/:/g, "|") === requested
          ) {
            out.set(requested, quote);
            break;
          }
        }
      }
    }

    futQuoteCache = { at: Date.now(), key: cacheKey, data: out };
    return out;
  })();

  futQuoteInflight = run;
  futQuoteInflightKey = cacheKey;
  try {
    return await run;
  } finally {
    if (futQuoteInflight === run) {
      futQuoteInflight = null;
      futQuoteInflightKey = null;
    }
  }
}

function findQuote(
  quotes: Map<string, UpstoxQuote>,
  instrumentKey: string,
  tradingSymbol: string,
): UpstoxQuote | null {
  return (
    quotes.get(instrumentKey) ??
    quotes.get(tradingSymbol) ??
    quotes.get(tradingSymbol.replace(/\s+/g, "")) ??
    null
  );
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

/** Previous session OI from daily candles (cached per IST day when coverage is good). */
export async function fetchPreviousOi(
  contracts: FutContract[],
  force = false,
): Promise<Map<string, number>> {
  const day = istDayKey();
  if (
    !force &&
    prevOiCache &&
    prevOiCache.day === day &&
    prevOiCache.values.size > 0
  ) {
    return prevOiCache.values;
  }

  const token = getAccessToken();
  const values = new Map<string, number>(
    prevOiCache?.day === day ? prevOiCache.values : undefined,
  );
  const to = new Date();
  const from = new Date(to.getTime() - 10 * 24 * 60 * 60_000);
  const toDate = to.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const fromDate = from.toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });

  // Keep concurrency low — Upstox historical is easily Cloudflare 429'd.
  const pending = contracts.filter((c) => !values.has(c.symbol));
  for (let i = 0; i < pending.length; i++) {
    const c = pending[i];
    let ok = false;
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      try {
        const path = `https://api.upstox.com/v2/historical-candle/${encodeURIComponent(
          c.instrumentKey,
        )}/day/${toDate}/${fromDate}`;
        const result = await fetchJson<{
          data?: { candles?: Array<Array<string | number>> };
        }>(path, {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
        });
        if (result.status === 429) {
          await sleep(800 * (attempt + 1));
          continue;
        }
        const candles = result.data?.data?.candles ?? [];
        if (!result.ok || !candles.length) break;

        for (const bar of candles) {
          const ts = String(bar[0] ?? "");
          const oi = Number(bar[6] ?? 0);
          if (!Number.isFinite(oi) || oi <= 0) continue;
          const barDay = ts.slice(0, 10);
          if (barDay === toDate) continue;
          values.set(c.symbol, oi);
          ok = true;
          break;
        }
        break;
      } catch {
        await sleep(400 * (attempt + 1));
      }
    }
    if (i + 1 < pending.length) await sleep(120);
  }

  // Never cache a total miss — that locked the board to NEUTRAL for the day.
  if (values.size > 0) {
    prevOiCache = { day, values };
  }
  return values;
}

function sessionOpenOiDiskPath(day: string) {
  return path.join(process.cwd(), "data", "oi-session-open", `${day}.json`);
}

async function readSessionOpenOiDisk(
  day: string,
): Promise<Map<string, number>> {
  try {
    const raw = JSON.parse(
      await readFile(sessionOpenOiDiskPath(day), "utf8"),
    ) as Record<string, number>;
    const map = new Map<string, number>();
    for (const [sym, oi] of Object.entries(raw)) {
      if (Number.isFinite(oi) && oi > 0) map.set(sym, oi);
    }
    return map;
  } catch {
    return new Map();
  }
}

async function writeSessionOpenOiDisk(day: string, values: Map<string, number>) {
  try {
    const dir = path.join(process.cwd(), "data", "oi-session-open");
    await mkdir(dir, { recursive: true });
    const obj: Record<string, number> = {};
    for (const [sym, oi] of values) obj[sym] = oi;
    await writeFile(sessionOpenOiDiskPath(day), JSON.stringify(obj), "utf8");
  } catch {
    /* non-fatal */
  }
}

function firstBarOi(
  candles: Array<Array<string | number>>,
): number | null {
  const rows = candles
    .map((bar) => {
      const ts = Date.parse(String(bar[0] ?? ""));
      const oi = Number(bar[6] ?? 0);
      return { ts, oi };
    })
    .filter((r) => Number.isFinite(r.ts) && Number.isFinite(r.oi) && r.oi > 0)
    .sort((a, b) => a.ts - b.ts);
  return rows[0]?.oi ?? null;
}

/**
 * First 5m bar OI for the IST session.
 * Live day → intraday endpoint (dated historical often returns [] while market is open).
 * Past / fallback → dated historical minutes/5.
 */
async function fetchOneSessionOpenOi(
  instrumentKey: string,
  sessionDate: string,
): Promise<number | null> {
  const token = getAccessToken();
  const today = istDayKey();
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  };

  const urls: string[] = [];
  if (sessionDate === today) {
    urls.push(
      `https://api.upstox.com/v3/historical-candle/intraday/${encodeURIComponent(
        instrumentKey,
      )}/minutes/5`,
    );
  }
  urls.push(
    `https://api.upstox.com/v3/historical-candle/${encodeURIComponent(
      instrumentKey,
    )}/minutes/5/${sessionDate}/${sessionDate}`,
  );

  for (const url of urls) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await fetchJson<{
          data?: { candles?: Array<Array<string | number>> };
        }>(url, { headers });
        if (result.status === 429) {
          await sleep(900 * (attempt + 1));
          continue;
        }
        const candles = result.data?.data?.candles ?? [];
        if (!result.ok || !candles.length) break;
        const oi = firstBarOi(candles);
        if (oi != null) return oi;
        break;
      } catch {
        await sleep(400 * (attempt + 1));
      }
    }
  }
  return null;
}

/**
 * Option 2 baseline: session-open OI from the first 5m futures candle.
 * Memory + disk cached per IST day. Warms missing symbols gradually
 * (`maxFetch` per call) to avoid Upstox 429s.
 */
export async function fetchSessionOpenOi(
  contracts: FutContract[],
  force = false,
  opts?: { maxFetch?: number },
): Promise<Map<string, number>> {
  const day = istDayKey();
  const maxFetch = opts?.maxFetch ?? 50;

  if (
    !force &&
    sessionOpenOiCache &&
    sessionOpenOiCache.day === day &&
    sessionOpenOiCache.values.size >= Math.min(contracts.length, 40)
  ) {
    const missing = contracts.filter(
      (c) => !sessionOpenOiCache!.values.has(c.symbol),
    );
    if (missing.length === 0) return sessionOpenOiCache.values;
  }

  const values = new Map<string, number>();
  if (sessionOpenOiCache?.day === day) {
    for (const [k, v] of sessionOpenOiCache.values) values.set(k, v);
  } else {
    const disk = await readSessionOpenOiDisk(day);
    for (const [k, v] of disk) values.set(k, v);
  }

  const pending = contracts.filter((c) => force || !values.has(c.symbol));
  const batch = pending.slice(0, maxFetch);
  let wrote = false;

  for (let i = 0; i < batch.length; i++) {
    const c = batch[i];
    const oi = await fetchOneSessionOpenOi(c.instrumentKey, day);
    if (oi != null && oi > 0) {
      values.set(c.symbol, oi);
      wrote = true;
    }
    if (i + 1 < batch.length) await sleep(120);
  }

  if (values.size > 0) {
    sessionOpenOiCache = { day, values };
    if (wrote) await writeSessionOpenOiDisk(day, values);
  }
  return values;
}

/**
 * Seed session-open OI from a live quote only when unknown.
 * Used in the first minutes before the 5m candle endpoint has a bar.
 * Never overwrites a candle-derived (or earlier) baseline.
 */
export function seedSessionOpenOi(symbol: string, oi: number): void {
  if (!Number.isFinite(oi) || oi <= 0) return;
  const day = istDayKey();
  if (!sessionOpenOiCache || sessionOpenOiCache.day !== day) {
    sessionOpenOiCache = { day, values: new Map() };
  }
  const sym = symbol.toUpperCase();
  if (sessionOpenOiCache.values.has(sym)) return;
  sessionOpenOiCache.values.set(sym, oi);
  void writeSessionOpenOiDisk(day, sessionOpenOiCache.values);
}

export function resolveQuoteForContract(
  quotes: Map<string, UpstoxQuote>,
  contract: FutContract,
): UpstoxQuote | null {
  return findQuote(quotes, contract.instrumentKey, contract.tradingSymbol);
}

export interface UpstoxOiSnapshot {
  openInterest: number;
  /** OI % vs session-open OI (Option 2). */
  oiChangePct: number;
  openOi: number | null;
  source: "upstox";
}

/**
 * Nearest-month stock-future OI for one underlying (stock popup / chart).
 * Option 2: OI % = vs session-open OI (first 5m bar).
 */
export async function fetchSymbolFuturesOi(
  symbol: string,
): Promise<UpstoxOiSnapshot | null> {
  if (!process.env.UPSTOX_ACCESS_TOKEN?.trim()) return null;

  const sym = symbol.toUpperCase();
  const futures = await loadNearestFutures(false);
  const contract = futures.get(sym);
  if (!contract) return null;

  const quotes = await fetchFuturesQuotes([contract.instrumentKey]);
  const q = resolveQuoteForContract(quotes, contract);
  const oi = Number(q?.oi ?? 0);
  if (!q || !Number.isFinite(oi) || oi <= 0) return null;

  const openMap = await fetchSessionOpenOi([contract], false, { maxFetch: 1 });
  let openOi = openMap.get(sym) ?? null;
  if (openOi == null) {
    // Very early session: seed from live quote once.
    seedSessionOpenOi(sym, oi);
    openOi = oi;
  }

  const oiChangePct =
    openOi != null && openOi > 0 ? ((oi - openOi) / openOi) * 100 : 0;

  return {
    openInterest: oi,
    oiChangePct,
    openOi,
    source: "upstox",
  };
}
