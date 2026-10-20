"use client";

import type { MarketBreadth } from "@/lib/types";

export function BreadthBar({ breadth }: { breadth: MarketBreadth }) {
  const { up, down, total } = breadth;
  const upPct = total ? (up / total) * 100 : 50;
  const downPct = total ? (down / total) * 100 : 50;

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-2 flex items-center justify-between text-sm">
        <h2 className="font-semibold">Market breadth</h2>
        <span className="text-xs text-[var(--muted)]">
          {up} up · {down} down · {total} scanned
        </span>
      </div>
      <div className="flex h-3 overflow-hidden rounded-full bg-[var(--surface-2)]">
        <div className="bg-emerald-500 transition-all" style={{ width: `${upPct}%` }} />
        <div className="bg-red-500 transition-all" style={{ width: `${downPct}%` }} />
      </div>
    </section>
  );
}
