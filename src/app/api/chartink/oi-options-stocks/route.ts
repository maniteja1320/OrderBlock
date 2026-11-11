import { NextResponse } from "next/server";
import { computeOiOptionsStocks } from "@/lib/oiOptionsStocks";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const force = searchParams.get("force") === "1";
    const data = await computeOiOptionsStocks(force);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      {
        updatedAt: new Date().toISOString(),
        universe: 0,
        scanned: 0,
        rows: [],
        source: "upstox",
        error:
          e instanceof Error
            ? e.message
            : "Open Interest Options Stocks failed",
      },
      { status: 500 },
    );
  }
}
