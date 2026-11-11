/**
 * NSE "OI spurts" underlyings — one call for day OI % change across F&O names.
 * Used when Upstox previous-day OI history is rate-limited / unavailable.
 */

export interface OiSpurtRow {
  symbol: string;
  latestOI: number;
  prevOI: number;
  changeInOI: number;
  /** Day OI % change (NSE field avgInOI). */
  oiChangePct: number;
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

let cache: { at: number; bySymbol: Map<string, OiSpurtRow> } | null = null;

async function nseCookies(): Promise<string> {
  const home = await fetch("https://www.nseindia.com", {
    headers: {
      "User-Agent": UA,
      Accept: "text/html",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
    cache: "no-store",
  });
  let cookie = (
    (home.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ??
    []
  )
    .map((c) => c.split(";")[0])
    .join("; ");

  const page = await fetch(
    "https://www.nseindia.com/market-data/live-analysis-underlying",
    {
      headers: {
        "User-Agent": UA,
        Accept: "text/html",
        Cookie: cookie,
        Referer: "https://www.nseindia.com/",
      },
      redirect: "follow",
      cache: "no-store",
    },
  );
  const more = (
    (page.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ??
    []
  ).map((c) => c.split(";")[0]);
  if (more.length) {
    const map = new Map(
      cookie
        .split("; ")
        .concat(more)
        .filter(Boolean)
        .map((p) => [p.split("=")[0], p]),
    );
    cookie = [...map.values()].join("; ");
  }
  return cookie;
}

export async function fetchOiSpurtsBySymbol(
  force = false,
): Promise<Map<string, OiSpurtRow>> {
  const now = Date.now();
  if (!force && cache && now - cache.at < 55_000) {
    return cache.bySymbol;
  }

  try {
    const cookie = await nseCookies();
    const res = await fetch(
      "https://www.nseindia.com/api/live-analysis-oi-spurts-underlyings",
      {
        headers: {
          "User-Agent": UA,
          Accept: "application/json,text/plain,*/*",
          Referer:
            "https://www.nseindia.com/market-data/live-analysis-underlying",
          "Accept-Language": "en-US,en;q=0.9",
          Cookie: cookie,
        },
        cache: "no-store",
      },
    );
    if (!res.ok) return cache?.bySymbol ?? new Map();
    const json = (await res.json()) as {
      data?: Array<{
        symbol?: string;
        latestOI?: number;
        prevOI?: number;
        changeInOI?: number;
        avgInOI?: number;
      }>;
    };

    const bySymbol = new Map<string, OiSpurtRow>();
    for (const row of json.data ?? []) {
      const symbol = String(row.symbol || "").toUpperCase();
      if (!symbol) continue;
      bySymbol.set(symbol, {
        symbol,
        latestOI: Number(row.latestOI ?? 0),
        prevOI: Number(row.prevOI ?? 0),
        changeInOI: Number(row.changeInOI ?? 0),
        oiChangePct: Number(row.avgInOI ?? 0),
      });
    }
    cache = { at: now, bySymbol };
    return bySymbol;
  } catch {
    return cache?.bySymbol ?? new Map();
  }
}
