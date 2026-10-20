"use client";

import type { SmartMoneyDetail } from "@/lib/types";

export function VolumeProfilePanel({
  smartMoney,
}: {
  smartMoney: SmartMoneyDetail | null | undefined;
}) {
  const profile = smartMoney?.profile;
  if (!profile?.bins.length) {
    return (
      <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-[var(--muted)]">
        Volume profile needs more session bars.
      </div>
    );
  }

  const max = Math.max(...profile.bins.map((b) => b.volume), 1);
  const pocIdx = profile.bins.reduce(
    (best, b, i, arr) => (b.volume > arr[best].volume ? i : best),
    0,
  );

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-wide uppercase text-[var(--muted)]">
          Volume profile
        </h3>
        <span className="text-[10px] text-[var(--muted)]">OHLC proxy</span>
      </div>
      <div className="mb-2 grid grid-cols-3 gap-1 text-[10px] text-[var(--muted)]">
        <div>
          VAH{" "}
          <span className="font-medium text-[var(--fg)]">
            {profile.vah.toFixed(2)}
          </span>
        </div>
        <div>
          POC{" "}
          <span className="font-medium text-[var(--accent)]">
            {profile.poc.toFixed(2)}
          </span>
        </div>
        <div>
          VAL{" "}
          <span className="font-medium text-[var(--fg)]">
            {profile.val.toFixed(2)}
          </span>
        </div>
      </div>
      <div className="flex h-48 flex-col-reverse gap-px">
        {profile.bins.map((b, idx) => {
          const pct = (b.volume / max) * 100;
          const buyPct =
            b.volume > 0 ? (b.buyVol / b.volume) * 100 : 50;
          const isPoc = idx === pocIdx;
          return (
            <div
              key={`${b.price}-${idx}`}
              className="group relative flex h-full min-h-[3px] items-center"
              title={`${b.price.toFixed(2)} · vol ${Math.round(b.volume)}`}
            >
              <div
                className={`h-full rounded-sm ${isPoc ? "ring-1 ring-[var(--accent)]" : ""}`}
                style={{
                  width: `${Math.max(4, pct)}%`,
                  background: `linear-gradient(90deg, rgba(239,68,68,0.75) 0%, rgba(239,68,68,0.75) ${100 - buyPct}%, rgba(34,197,94,0.8) ${100 - buyPct}%, rgba(34,197,94,0.8) 100%)`,
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
