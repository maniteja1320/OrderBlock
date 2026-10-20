import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";

export default function AboutPage() {
  return (
    <div>
      <SiteHeader solid />
      <main className="mx-auto max-w-3xl px-4 py-12 prose-sm">
        <h1 className="text-3xl font-semibold tracking-tight">About OrderBlock</h1>
        <p className="mt-4 text-[var(--muted)] leading-relaxed">
          We build a focused market terminal for Indian intraday traders: one
          screen that shows which F&O stocks are actually moving, and in which
          direction.
        </p>

        <h2 className="mt-10 text-xl font-semibold">Why we built it</h2>
        <p className="mt-3 text-[var(--muted)] leading-relaxed">
          Most intraday opportunities show themselves in the first hour. Yet
          most traders spend that hour flipping through dozens of charts. We
          wanted a board that does the scanning, measures every stock with the
          same yardstick, and leaves attention free for planning the trade and
          managing risk.
        </p>

        <h2 className="mt-10 text-xl font-semibold">What we build</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-[var(--muted)]">
          <li>
            The Order Block terminal — Bullish and Bearish boards refreshed every
            minute, with sector flow and market breadth.
          </li>
          <li>Trading journal — P&L calendar heatmap.</li>
          <li>Learning content and community spaces (coming in this clone).</li>
        </ul>

        <h2 className="mt-10 text-xl font-semibold">A method you can inspect</h2>
        <p className="mt-3 text-[var(--muted)] leading-relaxed">
          Strength = today&apos;s one-directional move from the open ÷ the
          stock&apos;s average daily move. See{" "}
          <Link href="/disclosures" className="text-[var(--accent)] underline">
            disclosures
          </Link>
          .
        </p>

        <p className="mt-10 text-sm text-[var(--muted)]">
          This local project recreates the publicly described OrderBlock product
          experience with live market data. It is not affiliated with Options
          Oracle / order-block.com.
        </p>
      </main>
    </div>
  );
}
