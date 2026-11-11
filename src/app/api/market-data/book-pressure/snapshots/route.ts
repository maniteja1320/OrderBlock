import { NextResponse } from "next/server";
import {
  captureBookSnapshot,
  ensureBookSnapshotScheduler,
  latestCloseSnapshot,
  listBookSnapshots,
  readBookSnapshot,
  type BookSnapshotKind,
} from "@/lib/upstox/bookSnapshots";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  ensureBookSnapshotScheduler();
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const kind = (searchParams.get("kind") as BookSnapshotKind | null) ?? "close";
  const latest = searchParams.get("latest") === "1";

  if (latest) {
    const snap = await latestCloseSnapshot();
    return NextResponse.json(
      snap ?? { error: "No close snapshot saved yet." },
      { status: snap ? 200 : 404 },
    );
  }

  if (date) {
    const snap = await readBookSnapshot(date, kind);
    return NextResponse.json(
      snap ?? { error: `No ${kind} snapshot for ${date}` },
      { status: snap ? 200 : 404 },
    );
  }

  const list = await listBookSnapshots();
  return NextResponse.json({ snapshots: list });
}

/** Force a snapshot now (manual) or retry today's close window. */
export async function POST(request: Request) {
  ensureBookSnapshotScheduler();
  if (!process.env.UPSTOX_ACCESS_TOKEN?.trim()) {
    return NextResponse.json(
      { error: "UPSTOX_ACCESS_TOKEN missing" },
      { status: 503 },
    );
  }

  let kind: BookSnapshotKind = "manual";
  try {
    const body = (await request.json()) as { kind?: string };
    if (body.kind === "close") kind = "close";
  } catch {
    /* empty body → manual */
  }

  try {
    const snap = await captureBookSnapshot(kind);
    return NextResponse.json(snap);
  } catch (e) {
    console.error("book-snapshot POST", e);
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Snapshot failed",
      },
      { status: 500 },
    );
  }
}
