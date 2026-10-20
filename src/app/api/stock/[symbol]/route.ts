import { NextResponse } from "next/server";
import { getStockDetail } from "@/lib/rankings";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await context.params;
  try {
    const detail = await getStockDetail(symbol);
    if (!detail) {
      return NextResponse.json({ error: "Symbol not found" }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (error) {
    console.error("stock detail error", error);
    return NextResponse.json(
      { error: "Failed to load stock" },
      { status: 500 },
    );
  }
}
