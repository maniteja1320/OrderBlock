import { gunzipSync } from "zlib";
import { FO_STOCKS } from "../symbols";

const INSTRUMENTS_URL =
  "https://assets.upstox.com/market-quote/instruments/exchange/complete.json.gz";

export interface EquityInstrument {
  symbol: string;
  instrumentKey: string;
  tradingSymbol: string;
  isin?: string;
}

interface RawInstrument {
  segment?: string;
  instrument_type?: string;
  instrument_key?: string;
  trading_symbol?: string;
  isin?: string;
  name?: string;
}

let cache: { at: number; bySymbol: Map<string, EquityInstrument> } | null =
  null;

/** NSE equity instrument keys for the F&O underlying universe. */
export async function loadFoEquityInstruments(
  force = false,
): Promise<Map<string, EquityInstrument>> {
  const now = Date.now();
  if (!force && cache && now - cache.at < 6 * 60 * 60_000) {
    return cache.bySymbol;
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
  const json = JSON.parse(gunzipSync(buf).toString("utf8")) as RawInstrument[];
  const foSet = new Set(FO_STOCKS.map((s) => s.symbol.toUpperCase()));
  const bySymbol = new Map<string, EquityInstrument>();

  for (const row of json) {
    if (row.segment !== "NSE_EQ") continue;
    if (row.instrument_type && row.instrument_type !== "EQ") continue;
    const trading = (row.trading_symbol || "").toUpperCase();
    if (!trading || !foSet.has(trading) || !row.instrument_key) continue;
    // Prefer exact EQ row; first win is fine (unique trading symbols).
    if (bySymbol.has(trading)) continue;
    bySymbol.set(trading, {
      symbol: trading,
      instrumentKey: row.instrument_key,
      tradingSymbol: trading,
      isin: row.isin,
    });
  }

  cache = { at: now, bySymbol };
  return bySymbol;
}
