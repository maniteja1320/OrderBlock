import { SiteHeader } from "@/components/SiteHeader";

export default function TermsPage() {
  return (
    <div>
      <SiteHeader solid />
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">Terms & Conditions</h1>
        <p className="mt-4 text-[var(--muted)] leading-relaxed">
          This local OrderBlock clone is for personal/educational use. Market
          data comes from public Yahoo Finance endpoints and may be delayed or
          incomplete. You are solely responsible for any trading decisions.
        </p>
        <ul className="mt-6 list-disc space-y-2 pl-5 text-[var(--muted)]">
          <li>No broker login is ever requested.</li>
          <li>Guest/user sessions are stored only in your browser.</li>
          <li>Journal trades are stored in localStorage on your device.</li>
          <li>Nothing on this app is a recommendation to buy or sell.</li>
        </ul>
      </main>
    </div>
  );
}
