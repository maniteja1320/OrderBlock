import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";

const reviews = [
  {
    name: "Rohan Deshmukh",
    role: "Options trader · Pune",
    text: "I used to waste the first 30–40 minutes just jumping between charts. Now I open the Bullish and Bearish boards, shortlist 3 names, and my day starts with clarity.",
  },
  {
    name: "Sneha Kulkarni",
    role: "F&O trader · Mumbai",
    text: "Having sector flow beside the rankings saves me from chasing isolated movers. If the sector is not supporting the move, I usually skip it.",
  },
  {
    name: "Farhan Sheikh",
    role: "Options trader · Hyderabad",
    text: "The Bearish board is honestly one of the strongest features. On weak market days, it helps me spot clean downside names much faster.",
  },
  {
    name: "Priya Nair",
    role: "Stock trader · Kochi",
    text: "I only trade during the first hour before leaving for work. This tool helps me quickly identify which stocks actually deserve my attention.",
  },
];

const faqs = [
  {
    q: "What exactly does OrderBlock show?",
    a: "It’s 9:20 AM. Nifty is moving. Which stocks to trade? Get the day’s top F&O stocks on one screen, updated every minute — with clean liquidity and order-block marking on chart.",
  },
  {
    q: "How does Liquidity help me catch big movers early?",
    a: "Our liquidity and strength scoring helps spot momentum when a new trend is starting. Choppy stocks score zero, so they don’t clutter your board.",
  },
  {
    q: "When is the board live?",
    a: "On trading days from 9:15 to 15:30 IST. On holidays and weekends you see the last session’s closing board.",
  },
  {
    q: "Can I use it on my phone?",
    a: "Yes. OrderBlock runs in the browser on phones, tablets and desktops. Nothing to install.",
  },
];

export default function HomePage() {
  return (
    <div className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 20% -10%, color-mix(in oklab, var(--accent) 28%, transparent), transparent), radial-gradient(ellipse 60% 40% at 90% 10%, rgba(180,140,60,0.18), transparent)",
        }}
      />
      <SiteHeader />

      <main>
        <section className="mx-auto grid max-w-6xl gap-10 px-4 pb-16 pt-12 md:grid-cols-2 md:items-center md:pt-20">
          <div>
            <p className="mb-3 text-sm font-medium text-[var(--accent)]">
              Live Order Blocks & Liquidity for F&O
            </p>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
              See Actual Order Block & Liquidity
            </h1>
            <ul className="mt-6 space-y-2 text-[var(--muted)]">
              <li>• Institutional Level Order Block</li>
              <li>• Find Liquidity Traps Early</li>
              <li>• Confusion Free Trading</li>
              <li>• Works on Any Phone/Computer</li>
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/terminal"
                className="rounded-md bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white"
              >
                Open terminal
              </Link>
              <Link
                href="/login"
                className="rounded-md border border-[var(--border)] px-5 py-2.5 text-sm font-medium"
              >
                Sign in
              </Link>
            </div>
            <p className="mt-4 text-xs text-[var(--muted)]">
              Analytics tool — not investment advice. Trading derivatives is risky.
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between text-xs text-[var(--muted)]">
              <span>Live board sample</span>
              <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-emerald-700 dark:text-emerald-400">
                Real data in terminal
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <SampleBoard
                title="Bullish"
                rows={[
                  ["SBIN", "+2.84%"],
                  ["AXISBANK", "+2.31%"],
                  ["TITAN", "+2.06%"],
                ]}
                tone="bull"
              />
              <SampleBoard
                title="Bearish"
                rows={[
                  ["INFY", "−2.47%"],
                  ["WIPRO", "−1.88%"],
                  ["HCLTECH", "−1.64%"],
                ]}
                tone="bear"
              />
            </div>
            <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
              <div className="flex items-baseline justify-between">
                <span className="font-semibold">SBIN</span>
                <span className="text-sm text-emerald-600">Sample #1 Bullish</span>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-[var(--muted)]">Order Block</dt>
                  <dd className="font-medium">836.20–838.40</dd>
                </div>
                <div>
                  <dt className="text-[var(--muted)]">Liquidity</dt>
                  <dd className="font-medium">829.70</dd>
                </div>
                <div>
                  <dt className="text-[var(--muted)]">Support</dt>
                  <dd className="font-medium">832.90</dd>
                </div>
                <div>
                  <dt className="text-[var(--muted)]">Resistance</dt>
                  <dd className="font-medium">848.60</dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        <section className="border-y border-[var(--border)] bg-[var(--surface)] py-16">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 md:grid-cols-3">
            <Feature
              title="Order Block Charts"
              body="See where big money started the move. Know reversal build-up, liquidity traps and the best zones to trade."
            />
            <Feature
              title="Liquidity Board"
              body="Find the best trades live with liquidity-based entry-exit. Confusion-free scanning of the F&O universe."
            />
            <Feature
              title="Market X-Ray"
              body="Find what to trade in seconds. Liquidity for entry, order block for timing — across 200+ stocks."
            />
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-2xl font-semibold tracking-tight">
            Small capital. Big rewards.
          </h2>
          <p className="mt-2 max-w-xl text-[var(--muted)]">
            Every F&O stock scanned for Order Block & Liquidity. Strongest ranked
            first — confusion-free trading.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <StatCard label="F&O stocks scanned" value="200+" />
            <StatCard label="Board refresh" value="1 min" />
            <StatCard label="Top each side" value="20" />
          </div>
        </section>

        <section className="border-y border-[var(--border)] bg-[var(--surface)] py-16">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-2xl font-semibold tracking-tight">
              Traders who open it every morning.
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">4.9 average · member feedback</p>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {reviews.map((r) => (
                <blockquote
                  key={r.name}
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-5"
                >
                  <p className="text-sm leading-relaxed">&ldquo;{r.text}&rdquo;</p>
                  <footer className="mt-4 text-xs text-[var(--muted)]">
                    <strong className="text-[var(--fg)]">{r.name}</strong> · {r.role}
                  </footer>
                </blockquote>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-4 py-16">
          <h2 className="text-2xl font-semibold tracking-tight">
            Questions traders ask before joining.
          </h2>
          <div className="mt-6 space-y-3">
            {faqs.map((f) => (
              <details
                key={f.q}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
              >
                <summary className="cursor-pointer font-medium">{f.q}</summary>
                <p className="mt-2 text-sm text-[var(--muted)]">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--border)] py-8 text-center text-xs text-[var(--muted)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-4 px-4">
          <Link href="/about">About</Link>
          <Link href="/updates">Updates</Link>
          <Link href="/disclosures">Disclosures</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/terminal">Terminal</Link>
        </div>
        <p className="mt-4">
          Risk disclosure: OrderBlock is a market analytics tool. Nothing here is
          investment advice.
        </p>
      </footer>
    </div>
  );
}

function SampleBoard({
  title,
  rows,
  tone,
}: {
  title: string;
  rows: string[][];
  tone: "bull" | "bear";
}) {
  return (
    <div>
      <div
        className={`mb-2 text-xs font-semibold ${
          tone === "bull" ? "text-emerald-600" : "text-red-600"
        }`}
      >
        {title}
      </div>
      <ul className="space-y-1.5 text-sm">
        {rows.map(([sym, pct], i) => (
          <li
            key={sym}
            className="flex items-center justify-between rounded-md bg-[var(--surface-2)] px-2 py-1.5"
          >
            <span>
              <span className="mr-2 text-[var(--muted)]">
                {String(i + 1).padStart(2, "0")}
              </span>
              {sym}
            </span>
            <span className={tone === "bull" ? "text-emerald-600" : "text-red-600"}>
              {pct}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{body}</p>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="text-3xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-sm text-[var(--muted)]">{label}</div>
    </div>
  );
}
