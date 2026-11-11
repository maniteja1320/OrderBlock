import { redirect } from "next/navigation";

/** Community tab replaced by TradeFinder R-Factor board. */
export default function CommunityRedirectPage() {
  redirect("/tradefinder");
}
