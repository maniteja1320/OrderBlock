import { SiteHeader } from "@/components/SiteHeader";
import { StructureClient } from "@/components/structure/StructureClient";

export default function StructurePage() {
  return (
    <div className="min-h-screen bg-[#05070c]">
      <SiteHeader solid />
      <StructureClient />
    </div>
  );
}
