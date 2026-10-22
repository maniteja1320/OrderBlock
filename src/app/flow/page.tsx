import { SiteHeader } from "@/components/SiteHeader";
import { FlowClient } from "@/components/flow/FlowClient";

export default function FlowPage() {
  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <SiteHeader solid />
      <FlowClient />
    </div>
  );
}
