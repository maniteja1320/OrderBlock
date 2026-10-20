import { SiteHeader } from "@/components/SiteHeader";
import { TerminalClient } from "@/components/terminal/TerminalClient";

export default function TerminalPage() {
  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <SiteHeader solid />
      <TerminalClient />
    </div>
  );
}