import { SiteHeader } from "@/components/SiteHeader";

export default function DisclosuresPage() {
  return (
    <div>
      <SiteHeader solid />
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">Disclosures</h1>

        <h2 className="mt-8 text-xl font-semibold">How the rankings are produced</h2>
        <p className="mt-3 text-[var(--muted)] leading-relaxed">
          Each stock&apos;s strength score is calculated as:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
          strength = today&apos;s one-directional move from the open ÷ average daily
          move
        </pre>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-[var(--muted)]">
          <li>
            Average daily move uses completed sessions over roughly the last 50
            calendar days and is fixed for the day after the open.
          </li>
          <li>
            A move counts only when it is clearly one-sided: distance on one side
            of the open must be more than twice the distance on the other.
            Otherwise the score is zero.
          </li>
          <li>
            Scores are recalculated every minute from one-minute prices during
            market hours.
          </li>
        </ul>

        <h2 className="mt-10 text-xl font-semibold">Risk disclosure on derivatives</h2>
        <p className="mt-3 text-sm text-[var(--muted)] leading-relaxed">
          As published by SEBI from its study dated 25 January 2023: 9 out of 10
          individual traders in the equity F&O segment incurred net losses. This
          software does not provide investment advice.
        </p>
      </main>
    </div>
  );
}
