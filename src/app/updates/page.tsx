import { SiteHeader } from "@/components/SiteHeader";

const updates = [
  {
    v: "2.9",
    title: "Institutional Order-Block & Liquidity in popup charts",
    body: "Popup charts mark zones and liquidity levels. Tap a top pick to open the chart without leaving the page.",
  },
  {
    v: "2.7",
    title: "The whole market in one picture",
    body: "Scatter of every F&O stock at its move for the day, with leading and lagging sectors.",
  },
  {
    v: "2.5",
    title: "Full terminal on your phone",
    body: "Boards stack cleanly; tap any stock for chart, zones and stats; search any name.",
  },
  {
    v: "2.4",
    title: "Market breadth bar",
    body: "See how many F&O stocks are up vs down, refreshed with the rankings.",
  },
  {
    v: "2.0",
    title: "Redesigned terminal",
    body: "Light/dark themes, faster engine, mobile layout, home top picks.",
  },
  {
    v: "1.4",
    title: "Trading journal",
    body: "Log symbol, side, qty, entry, exit, dates and setup tags with a P&L heatmap.",
  },
  {
    v: "1.2",
    title: "Sector flow panel",
    body: "Sectors ranked by average strength of their F&O stocks.",
  },
];

export default function UpdatesPage() {
  return (
    <div>
      <SiteHeader solid />
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">What&apos;s new</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Features shipped in this clone, aligned with the public OrderBlock changelog.
        </p>
        <ol className="mt-8 space-y-4">
          {updates.map((u) => (
            <li
              key={u.v}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
            >
              <div className="text-xs font-medium text-[var(--accent)]">v{u.v}</div>
              <h2 className="mt-1 font-semibold">{u.title}</h2>
              <p className="mt-2 text-sm text-[var(--muted)]">{u.body}</p>
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}
