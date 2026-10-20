"use client";

import { useCallback, useEffect, useState } from "react";
import type { SmartMoneyScanRow } from "@/lib/types";
import { StockSheet } from "@/components/terminal/StockSheet";

export function SmartMoneyClient() {
  const [rows, setRows] = useState<SmartMoneyScanRow[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    try {
      setError(null);
      const res = await fetch(`/api/smart-money${force ? "?force=1" : ""}`);
      if (!res.ok) throw new Error("fail");
      const json = (await res.json()) as {
        updatedAt: string;
        rows: SmartMoneyScanRow[];
      };
      setRows(json.rows);
      setUpdatedAt(json.updatedAt);
    } catch {
      setError("Could not load smart-money scan.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(true);
    const id = setInterval(() => load(false), 60_000);
    return () => clearInterval(id);
  }, [load]);

  const symbols = rows.map((r) => r.symbol);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-6">
        <p className="text-xs font-medium tracking-[0.14em] uppercase text-[var(--accent)]">
          OrderBlock · Smart Money
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          Tape bias from the session
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
          Proxy CVD, relative volume, big prints and absorption on the strength
          board — built from OHLC (not tick footprint). Opens the same OB chart
          with volume profile + delta panes.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--muted)]">
          <span>
            {updatedAt
              ? `Updated ${new Date(updatedAt).toLocaleTimeString("en-IN", {
                  timeZone: "Asia/Kolkata",
                  hour: "2-digit",
                  minute: "2-digit",
                })} IST`
              : "—"}
          </span>
          <button
            type="button"
            onClick={() => load(true)}
            className="rounded-md border border-[var(--border)] px-2 py-1 hover:text-[var(--fg)]"
          >
            Refresh
          </button>
          {error && <span className="text-[var(--bear)]">{error}</span>}
        </div>
      </div>

      {loading && !rows.length ? (
        <p className="text-sm text-[var(--muted)]">Scanning board…</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-[var(--border)]">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-[var(--surface-2)] text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Symbol</th>
                <th className="px-3 py-2 font-medium">Score</th>
                <th className="px-3 py-2 font-medium">Bias</th>
                <th className="px-3 py-2 font-medium">RVOL</th>
                <th className="px-3 py-2 font-medium">CVD</th>
                <th className="px-3 py-2 font-medium">Prints</th>
                <th className="px-3 py-2 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.symbol}
                  className="cursor-pointer border-t border-[var(--border)] hover:bg-[var(--surface-2)]"
                  onClick={() => setSelected(r.symbol)}
                >
                  <td className="px-3 py-2 text-[var(--muted)]">{i + 1}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.symbol}</div>
                    <div className="text-[11px] text-[var(--muted)]">
                      {r.changePct >= 0 ? "+" : ""}
                      {r.changePct.toFixed(2)}% · {r.sector}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-semibold tabular-nums">
                    {r.score}
                  </td>
                  <td
                    className={`px-3 py-2 text-xs font-medium uppercase ${
                      r.bias === "bullish"
                        ? "text-[var(--bull)]"
                        : r.bias === "bearish"
                          ? "text-[var(--bear)]"
                          : "text-[var(--muted)]"
                    }`}
                  >
                    {r.bias}
                    {r.divergence !== "none" ? (
                      <span className="ml-1 text-[10px] text-amber-500">
                        div
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.relativeVolume.toFixed(2)}×
                  </td>
                  <td
                    className={`px-3 py-2 tabular-nums ${
                      r.cvd >= 0 ? "text-[var(--bull)]" : "text-[var(--bear)]"
                    }`}
                  >
                    {r.cvd >= 0 ? "+" : ""}
                    {Math.round(r.cvd).toLocaleString("en-IN")}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-[var(--muted)]">
                    {r.bigPrintCount} / {r.absorptionCount}
                  </td>
                  <td className="max-w-[220px] truncate px-3 py-2 text-xs text-[var(--muted)]">
                    {r.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <StockSheet
          symbol={selected}
          symbols={symbols}
          onClose={() => setSelected(null)}
          onNavigate={setSelected}
        />
      )}
    </div>
  );
}
