"use client";

import type { SectorSeries } from "@/lib/structureBoard";

const COLORS = [
  "#22c55e",
  "#ef4444",
  "#38bdf8",
  "#a78bfa",
  "#f59e0b",
  "#f472b6",
  "#94a3b8",
  "#2dd4bf",
  "#fb7185",
  "#eab308",
  "#60a5fa",
  "#c084fc",
  "#4ade80",
  "#f87171",
  "#67e8f9",
  "#d8b4fe",
  "#fdba74",
  "#f9a8d4",
  "#cbd5e1",
  "#5eead4",
  "#fda4af",
];

/** Nudge end labels apart when they land on similar Y. */
function dodgeLabels(
  items: Array<{ sector: string; color: string; y: number; changePct: number }>,
  minGap = 12,
) {
  const sorted = [...items].sort((a, b) => a.y - b.y);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].y - sorted[i - 1].y < minGap) {
      sorted[i] = { ...sorted[i], y: sorted[i - 1].y + minGap };
    }
  }
  return sorted;
}

export function SectorLinesChart({
  sectors,
  height = 340,
}: {
  sectors: SectorSeries[];
  height?: number;
}) {
  if (!sectors.length) {
    return (
      <div
        className="flex items-center justify-center text-xs text-white/40"
        style={{ height }}
      >
        Waiting for sector paths…
      </div>
    );
  }

  const allPct = sectors.flatMap((s) => s.points.map((p) => p.pct));
  const minY = Math.min(-0.5, ...allPct);
  const maxY = Math.max(0.5, ...allPct);
  const pad = (maxY - minY) * 0.08 || 0.2;
  const y0 = minY - pad;
  const y1 = maxY + pad;

  const maxLen = Math.max(...sectors.map((s) => s.points.length), 1);
  const w = 720;
  const h = height;
  const left = 44;
  const right = 118;
  const top = 14;
  const bottom = 28;
  const iw = w - left - right;
  const ih = h - top - bottom;

  const xAt = (i: number) => left + (i / Math.max(1, maxLen - 1)) * iw;
  const yAt = (pct: number) => top + ((y1 - pct) / (y1 - y0)) * ih;

  const zeroY = yAt(0);
  const ticks = [y1, (y1 + y0) / 2, y0];

  const labelItems = dodgeLabels(
    sectors.map((s, si) => {
      const last = s.points[s.points.length - 1];
      return {
        sector: s.sector,
        color: COLORS[si % COLORS.length],
        y: last ? yAt(last.pct) : top + ih / 2,
        changePct: s.changePct,
      };
    }),
  );

  return (
    <div className="w-full space-y-3">
      <div className="relative w-full overflow-hidden rounded-md" style={{ height }}>
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="h-full w-full"
          preserveAspectRatio="xMidYMid meet"
        >
          <rect x={0} y={0} width={w} height={h} fill="#05070c" />
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={left}
                x2={w - right}
                y1={yAt(t)}
                y2={yAt(t)}
                stroke="rgba(255,255,255,0.06)"
              />
              <text
                x={left - 6}
                y={yAt(t) + 3}
                textAnchor="end"
                fill="rgba(255,255,255,0.45)"
                fontSize="10"
                fontFamily="ui-sans-serif, system-ui, sans-serif"
              >
                {t.toFixed(1)}
              </text>
            </g>
          ))}
          <line
            x1={left}
            x2={w - right}
            y1={zeroY}
            y2={zeroY}
            stroke="rgba(255,255,255,0.18)"
            strokeDasharray="3 3"
          />
          {sectors.map((s, si) => {
            const color = COLORS[si % COLORS.length];
            const d = s.points
              .map((p, i) => {
                const x = xAt(i);
                const y = yAt(p.pct);
                return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
              })
              .join(" ");
            return (
              <path
                key={s.sector}
                d={d}
                fill="none"
                stroke={color}
                strokeWidth={1.6}
                opacity={0.9}
              />
            );
          })}
          {labelItems.map((item) => (
            <g key={item.sector}>
              <line
                x1={w - right + 2}
                x2={w - right + 10}
                y1={item.y}
                y2={item.y}
                stroke={item.color}
                strokeWidth={1.25}
                opacity={0.7}
              />
              <text
                x={w - right + 14}
                y={item.y + 3.5}
                fill={item.color}
                fontSize="11"
                fontWeight="700"
                fontFamily="ui-sans-serif, system-ui, sans-serif"
              >
                {item.sector}
              </text>
            </g>
          ))}
        </svg>
        <div className="pointer-events-none absolute bottom-1 left-12 right-[7.5rem] flex justify-between text-[10px] text-white/40">
          <span>09:15</span>
          <span>session %</span>
          <span>15:30</span>
        </div>
      </div>

      <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3 md:grid-cols-4">
        {sectors.map((s, si) => {
          const color = COLORS[si % COLORS.length];
          const up = s.changePct >= 0;
          return (
            <li
              key={s.sector}
              className="flex items-center gap-2 text-[11px] text-white/85"
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: color }}
                aria-hidden
              />
              <span className="min-w-0 truncate font-semibold tracking-wide">
                {s.sector}
              </span>
              <span
                className={`ml-auto tabular-nums ${
                  up ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {up ? "+" : ""}
                {s.changePct.toFixed(2)}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
