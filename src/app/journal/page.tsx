import { SiteHeader } from "@/components/SiteHeader";
import { JournalClient } from "@/components/journal/JournalClient";

export default function JournalPage() {
  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <SiteHeader solid />
      <JournalClient />
    </div>
  );
}
