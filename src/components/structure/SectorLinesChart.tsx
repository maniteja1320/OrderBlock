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
];

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
  const w = 640;
  const h = height;
  const left = 52;
  const right = 8;
  const top = 12;
  const bottom = 22;
  const iw = w - left - right;
  const ih = h - top - bottom;

  const xAt = (i: number) => left + (i / Math.max(1, maxLen - 1)) * iw;
  const yAt = (pct: number) => top + ((y1 - pct) / (y1 - y0)) * ih;

  const zeroY = yAt(0);
  const ticks = [y1, (y1 + y0) / 2, y0];

  return (
    <div className="relative w-full overflow-hidden" style={{ height }}>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-full w-full" preserveAspectRatio="none">
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
              fill="rgba(255,255,255,0.35)"
              fontSize="9"
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
          const last = s.points[s.points.length - 1];
          const lx = xAt(s.points.length - 1);
          const ly = last ? yAt(last.pct) : 0;
          return (
            <g key={s.sector}>
              <path d={d} fill="none" stroke={color} strokeWidth={1.25} opacity={0.85} />
              {last && (
                <text
                  x={Math.min(lx + 4, w - right - 2)}
                  y={ly - 2}
                  fill={color}
                  fontSize="8"
                  fontWeight="600"
                >
                  {s.sector.toUpperCase()}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="pointer-events-none absolute bottom-1 left-14 right-2 flex justify-between text-[9px] text-white/30">
        <span>09:15</span>
        <span>session %</span>
        <span>15:30</span>
      </div>
    </div>
  );
}
