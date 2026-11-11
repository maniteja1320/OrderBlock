"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { isWeekdayMarketHours } from "@/lib/marketHours";
import type {
  OiBuildUpBoardResponse,
  OiBuildUpRow,
} from "@/lib/oiBuildUpBoard";
import { StockSheet } from "@/components/terminal/StockSheet";

function BuildUpBoard({
  title,
  side,
  rows,
  onSelect,
  selected,
}: {
  title: string;
  side: "bullish" | "bearish";
  rows: OiBuildUpRow[];
  onSelect: (symbol: string) => void;
  selected?: string | null;
}) {
  const accent = side === "bullish" ? "text-emerald-600" : "text-red-600";
  const empty =
    side === "bullish"
      ? "No LONG BUILD-UP names yet…"
      : "No SHORT BUILD-UP names yet…";

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <h2 className={`text-sm font-semibold ${accent}`}>{title}</h2>
        <span className="text-xs text-[var(--muted)]">{rows.length} names</span>
      </div>
      <ul className="divide-y divide-[var(--border)]">
        {rows.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-[var(--muted)]">
            {empty}
          </li>
        )}
        {rows.map((row) => {
          const active = selected === row.symbol;
          return (
            <li key={row.symbol}>
              <button
                type="button"
                onClick={() => onSelect(row.symbol)}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-[var(--surface-2)] ${
                  active ? "bg-[var(--surface-2)]" : ""
                }`}
              >
                <span className="w-6 text-xs tabular-nums text-[var(--muted)]">
                  {String(row.rank).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{row.symbol}</span>
                    {row.rankChange !== 0 && (
                      <span
                        className={`text-[10px] ${
                          row.rankChange > 0
                            ? "text-emerald-600"
                            : "text-red-600"
                        }`}
                      >
                        {row.rankChange > 0 ? "▲" : "▼"}
                        {Math.abs(row.rankChange)}
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs text-[var(--muted)]">
                    {row.buildUp}
                    {row.oiChangePct != null
                      ? ` · OI ${row.oiChangePct >= 0 ? "+" : ""}${row.oiChangePct.toFixed(1)}%`
                      : ""}
                    {" · "}
                    score {row.score.toFixed(3)}
                    {row.oiSource !== "none" ? ` · ${row.oiSource}` : ""}
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className={`text-sm font-medium tabular-nums ${
                      row.changePct >= 0 ? "text-emerald-600" : "text-red-600"
                    }`}
                  >
                    {row.changePct >= 0 ? "+" : ""}
                    {row.changePct.toFixed(2)}%
                  </div>
                  <div className="text-[10px] tabular-nums text-[var(--muted)]">
                    {row.last.toFixed(2)}
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function MarketDataClient() {
  const [data, setData] = useState<OiBuildUpBoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    try {
      setError(null);
      const res = await fetch(`/api/market-data${force ? "?force=1" : ""}`);
      const json = (await res.json()) as OiBuildUpBoardResponse & {
        error?: string;
      };
      if (!res.ok && !json.bullish) {
        throw new Error(json.error || "Failed to load market data");
      }
      setData(json);
      if (json.error) setError(json.error);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not refresh OI build-up board.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Prefer cache/disk-warm path first; Refresh still force-pulls quotes + OI batch.
    void load(false);
    const id = setInterval(() => {
      if (isWeekdayMarketHours()) void load(false);
    }, 60_000);
    return () => clearInterval(id);
  }, [load]);

  const boardSymbols = useMemo(() => {
    if (!data) return [];
    return [...data.bullish, ...data.bearish].map((r) => r.symbol);
  }, [data]);

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Market Data</h1>
          <p className="text-sm text-[var(--muted)]">
            OI build-up · Upstox futures · Option 2 (OI vs session open)
            {data?.updatedAt && (
              <>
                {" · "}
                refreshed{" "}
                {new Date(data.updatedAt).toLocaleTimeString("en-IN", {
                  timeZone: "Asia/Kolkata",
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                IST
              </>
            )}
          </p>
          {data && (
            <p className="mt-1 text-xs text-[var(--muted)]">
              Universe {data.universe} · futures {data.matchedFutures} · quoted{" "}
              {data.quoted} · long {data.bullish.length} · short{" "}
              {data.bearish.length}
              {data.marketStatus?.label ? ` · ${data.marketStatus.label}` : ""}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void load(true);
          }}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted)] hover:text-[var(--fg)]"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          {error}
        </div>
      )}

      <p className="text-xs text-[var(--muted)]">
        Option 2 · OI% vs session open · LONG = price↑ + OI↑ + intraday↑ · SHORT
        = price↓ + OI↑ + intraday↓ · ranked by strength × (1 + OI%/100) · top 20
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <BuildUpBoard
          title="Long build-up"
          side="bullish"
          rows={data?.bullish ?? []}
          onSelect={setSelected}
          selected={selected}
        />
        <BuildUpBoard
          title="Short build-up"
          side="bearish"
          rows={data?.bearish ?? []}
          onSelect={setSelected}
          selected={selected}
        />
      </div>

      <StockSheet
        symbol={selected}
        symbols={boardSymbols}
        onClose={() => setSelected(null)}
        onNavigate={setSelected}
      />
    </div>
  );
}
