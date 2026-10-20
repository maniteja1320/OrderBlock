import { SiteHeader } from "@/components/SiteHeader";
import { SmartMoneyClient } from "@/components/smart-money/SmartMoneyClient";

export default function SmartMoneyPage() {
  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <SiteHeader solid />
      <SmartMoneyClient />
    </div>
  );
}
