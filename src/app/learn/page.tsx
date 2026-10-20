import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";

const lessons = [
  {
    title: "Reading strength scores",
    mins: 4,
    body: "How one-directional move ÷ average daily range ranks the board.",
  },
  {
    title: "Order blocks and the Z zone",
    mins: 6,
    body: "Where the impulsive move started, and why S1 invalidates the idea.",
  },
  {
    title: "Liquidity levels ahead",
    mins: 5,
    body: "R1 / R2 as untested swing highs and lows where stops wait.",
  },
  {
    title: "Position sizing for F&O",
    mins: 7,
    body: "Risk first: size from stop distance, not from conviction.",
  },
];

export default function LearnPage() {
  return (
    <div>
      <SiteHeader solid />
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">Learning</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Short, practical lessons on reading strength, order blocks and risk.
        </p>
        <ul className="mt-8 space-y-3">
          {lessons.map((l) => (
            <li
              key={l.title}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold">{l.title}</h2>
                <span className="text-xs text-[var(--muted)]">{l.mins} min</span>
              </div>
              <p className="mt-2 text-sm text-[var(--muted)]">{l.body}</p>
              <Link
                href="/disclosures"
                className="mt-3 inline-block text-sm text-[var(--accent)] underline"
              >
                Open method notes
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
