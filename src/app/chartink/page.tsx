import { SiteHeader } from "@/components/SiteHeader";
import { ChartinkClient } from "@/components/chartink/ChartinkClient";

export default function ChartinkPage() {
  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <SiteHeader solid />
      <ChartinkClient />
    </div>
  );
}
