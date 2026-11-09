import type { OpeningPeriod } from "./types";

/** Open windows (minutes) for a weekday. Handles overnight closes and 24h places. null = unknown. */
export function openWindows(periods: OpeningPeriod[] | null, weekday: number): [number, number][] | null {
  if (!periods) return null;
  if (periods.length === 1 && !periods[0].close && periods[0].open.day === 0 && periods[0].open.hour === 0) return [[0, 1440]]; // 24/7
  const out: [number, number][] = [];
  for (const p of periods) {
    const o = p.open.hour * 60 + p.open.minute;
    if (!p.close) { if (p.open.day === weekday) out.push([o, 1440]); continue; }
    const c = p.close.hour * 60 + p.close.minute;
    if (p.open.day === weekday) out.push([o, p.close.day === weekday ? c : 1440]);
    else if (p.close.day === weekday && p.open.day === (weekday + 6) % 7) out.push([0, c]); // spill from yesterday
  }
  return out.sort((a, b) => a[0] - b[0]);
}

/**
 * Earliest start ≥ arrive such that [start, start+visit] fits inside an open window.
 * Returns null if impossible that day. Unknown hours → allowed (caller adds a warning).
 */
export function fitVisit(windows: [number, number][] | null, arrive: number, visit: number): number | null {
  if (windows === null) return arrive;
  for (const [o, c] of windows) {
    const s = Math.max(arrive, o);
    if (s + visit <= c) return s;
  }
  return null;
}
