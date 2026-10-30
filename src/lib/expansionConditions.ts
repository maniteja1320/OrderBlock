/** Shared condition copy for Smart Money UI + scan (safe for client import). */

export const BULLISH_CONDITIONS = [
  "Today's range (H−L) > each of the prior 7 daily ranges",
  "Daily close > daily open",
  "Daily close > prior day close",
  "Weekly close > weekly open",
  "Monthly close > monthly open",
  "Prior day volume > 10,000",
  "SMA20 > SMA50 > SMA200 (daily)",
];

export const BEARISH_CONDITIONS = [
  "Today's range (H−L) > each of the prior 7 daily ranges",
  "Daily close < daily open",
  "Daily close < prior day close",
  "Weekly close < weekly open",
  "Monthly close < monthly open",
  "Prior day volume > 10,000",
  "SMA20 < SMA50 < SMA200 (daily)",
];
