"use client";

import type { RankingsResponse } from "@/lib/types";

export function MarketScatter({ data }: { data: RankingsResponse }) {
  const points = data.all;
  if (!points.length) return null;

  const maxAbs = Math.max(3, ...points.map((p) => Math.abs(p.changePct)));

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Whole market</h2>
          <p className="text-xs text-[var(--muted)]">
            Every F&O stock as a dot at today&apos;s move
          </p>
        </div>
        <div className="flex gap-3 text-xs">
          <span className="text-emerald-600">
            Bullish {points.filter((p) => p.side === "bullish").length}
          </span>
          <span className="text-red-600">
            Bearish {points.filter((p) => p.side === "bearish").length}
          </span>
        </div>
      </div>

      <div className="relative h-28 overflow-hidden rounded-lg bg-[var(--surface-2)]">
        <div className="absolute left-0 right-0 top-1/2 h-px bg-[var(--border)]" />
        {points.map((p) => {
          const x = ((p.changePct + maxAbs) / (2 * maxAbs)) * 100;
          const y =
            p.side === "bullish"
              ? 18 + Math.min(30, p.strength * 40)
              : p.side === "bearish"
                ? 82 - Math.min(30, p.strength * 40)
                : 50;
          const color =
            p.side === "bullish"
              ? "#16a34a"
              : p.side === "bearish"
                ? "#dc2626"
                : "#94a3b8";
          return (
            <span
              key={p.symbol}
              title={`${p.symbol} ${p.changePct.toFixed(2)}%`}
              className="absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-80"
              style={{ left: `${x}%`, top: `${y}%`, background: color }}
            />
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-4 text-xs text-[var(--muted)]">
        {data.leadingSector && (
          <span>
            Leading:{" "}
            <strong className="text-emerald-600">{data.leadingSector.sector}</strong>
          </span>
        )}
        {data.laggingSector && (
          <span>
            Lagging:{" "}
            <strong className="text-red-600">{data.laggingSector.sector}</strong>
          </span>
        )}
      </div>
    </section>
  );
}
