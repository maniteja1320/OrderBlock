"use client";

import type { SectorFlow } from "@/lib/types";

export function SectorPanel({ sectors }: { sectors: SectorFlow[] }) {
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <h2 className="mb-3 text-sm font-semibold">Sector flow</h2>
      <ul className="max-h-80 space-y-1.5 overflow-auto text-sm">
        {sectors.map((s) => (
          <li
            key={s.sector}
            className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-[var(--surface-2)]"
          >
            <span>{s.sector}</span>
            <span
              className={
                s.avgStrength > 0
                  ? "font-medium text-emerald-600"
                  : s.avgStrength < 0
                    ? "font-medium text-red-600"
                    : "text-[var(--muted)]"
              }
            >
              {s.avgStrength > 0 ? "+" : ""}
              {s.avgStrength.toFixed(2)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
