import { SiteHeader } from "@/components/SiteHeader";
import { TradeFinderClient } from "@/components/tradefinder/TradeFinderClient";

export default function TradeFinderPage() {
  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <SiteHeader solid />
      <TradeFinderClient />
    </div>
  );
}
