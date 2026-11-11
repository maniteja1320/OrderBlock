import { SiteHeader } from "@/components/SiteHeader";
import { MarketDataClient } from "@/components/market-data/MarketDataClient";

export default function MarketDataPage() {
  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <SiteHeader solid />
      <MarketDataClient />
    </div>
  );
}
