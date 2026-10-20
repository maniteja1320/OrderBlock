export interface OiSnapshot {
  openInterest: number;
  oiChangePct: number;
  source: "nse" | "unavailable";
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const OI_TIMEOUT_MS = 1500;

let cookieJar = "";
let cookieAt = 0;
let nseDisabledUntil = 0;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

async function ensureNseCookies(): Promise<string> {
  if (cookieJar && Date.now() - cookieAt < 10 * 60_000) return cookieJar;
  try {
    const res = await fetchWithTimeout(
      "https://www.nseindia.com",
      {
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml",
        },
        redirect: "follow",
      },
      OI_TIMEOUT_MS,
    );
    const headers = res.headers as Headers & { getSetCookie?: () => string[] };
    const parts = headers.getSetCookie?.() ?? [];
    if (parts.length) {
      cookieJar = parts.map((c) => c.split(";")[0]).join("; ");
    }
    cookieAt = Date.now();
  } catch {
    cookieJar = "";
  }
  return cookieJar;
}

/**
 * Best-effort futures OI from NSE. Hard-timeout so it never blocks the chart.
 */
export async function fetchFuturesOi(symbol: string): Promise<OiSnapshot | null> {
  if (Date.now() < nseDisabledUntil) return null;

  try {
    const cookies = await ensureNseCookies();
    const url = `https://www.nseindia.com/api/quote-derivative?symbol=${encodeURIComponent(symbol)}`;
    const res = await fetchWithTimeout(
      url,
      {
        headers: {
          "User-Agent": UA,
          Accept: "application/json,text/plain,*/*",
          Referer: "https://www.nseindia.com/",
          ...(cookies ? { Cookie: cookies } : {}),
        },
      },
      OI_TIMEOUT_MS,
    );
    if (!res.ok) {
      nseDisabledUntil = Date.now() + 5 * 60_000;
      return null;
    }
    const json = (await res.json()) as {
      stocks?: Array<{
        metadata?: {
          instrumentType?: string;
          openInterest?: number;
          pchangeinOpenInterest?: number;
        };
        marketDeptOrderBook?: {
          tradeInfo?: {
            openInterest?: number;
            pchangeinOpenInterest?: number;
          };
        };
      }>;
    };

    const futures = (json.stocks ?? []).filter((s) =>
      (s.metadata?.instrumentType || "").toUpperCase().includes("FUT"),
    );
    const row = futures[0] ?? json.stocks?.[0];
    if (!row) return null;

    const meta = row.metadata;
    const trade = row.marketDeptOrderBook?.tradeInfo;
    const oi = meta?.openInterest ?? trade?.openInterest;
    const oiChgPct =
      meta?.pchangeinOpenInterest ?? trade?.pchangeinOpenInterest ?? null;

    if (oi == null || !Number.isFinite(Number(oi))) return null;

    return {
      openInterest: Number(oi),
      oiChangePct: Number(oiChgPct ?? 0),
      source: "nse",
    };
  } catch {
    nseDisabledUntil = Date.now() + 5 * 60_000;
    return null;
  }
}
