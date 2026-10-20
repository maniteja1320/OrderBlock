import { NextResponse } from "next/server";
import { getMarketStatus } from "@/lib/marketHours";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getMarketStatus());
}
