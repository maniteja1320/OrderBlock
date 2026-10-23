import type { MarketStatus } from "./types";

/** Approximate NSE holidays for 2026 (extend as needed). */
const HOLIDAYS_2026 = new Set([
  "2026-01-26",
  "2026-03-03",
  "2026-03-26",
  "2026-03-31",
  "2026-04-03",
  "2026-04-14",
  "2026-05-01",
  "2026-08-15",
  "2026-09-14",
  "2026-10-02",
  "2026-10-20",
  "2026-11-05",
  "2026-11-24",
  "2026-12-25",
]);

function istParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

export function getMarketStatus(now = new Date()): MarketStatus {
  const p = istParts(now);
  const asOf = now.toISOString();
  const mins = p.hour * 60 + p.minute;

  if (HOLIDAYS_2026.has(p.date)) {
    return { state: "holiday", label: "Market holiday", asOf };
  }

  const weekend = p.weekday === "Sat" || p.weekday === "Sun";
  if (weekend) {
    return { state: "closed", label: "Weekend — last session board", asOf };
  }

  const open = 9 * 60 + 15;
  const close = 15 * 60 + 30;
  const pre = 9 * 60;

  if (mins >= open && mins < close) {
    const h = String(p.hour).padStart(2, "0");
    const m = String(p.minute).padStart(2, "0");
    return { state: "live", label: `Live ${h}:${m}`, asOf };
  }

  if (mins >= pre && mins < open) {
    return { state: "preopen", label: "Pre-open", asOf };
  }

  return { state: "closed", label: "Market closed — last session board", asOf };
}

export function isMarketLive(now = new Date()): boolean {
  return getMarketStatus(now).state === "live";
}

/**
 * Mon–Fri, 09:15–15:30 IST — ignores the holiday list.
 * Used to gate auto-refresh polling.
 */
export function isWeekdayMarketHours(now = new Date()): boolean {
  const p = istParts(now);
  if (p.weekday === "Sat" || p.weekday === "Sun") return false;
  const mins = p.hour * 60 + p.minute;
  const open = 9 * 60 + 15;
  const close = 15 * 60 + 30;
  return mins >= open && mins < close;
}
