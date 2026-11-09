import { haversineMeters } from "@/lib/pipeline/dedupe";
import type { LatLng, PlannerDay, PlannerPlace } from "./types";

const PRIORITY_RANK = { must_visit: 0, high: 1, normal: 2, optional: 3 } as const;
const ROUGH_LEG_MIN = 30;

/**
 * Assign places to days by geography (capacity-aware k-means).
 * Hotels of the night anchor a day's cluster; locked / fixed / preferred dates are honoured first.
 */
export function assignDays(places: PlannerPlace[], days: PlannerDay[]): Map<string, PlannerPlace[]> {
  const res = new Map<string, PlannerPlace[]>(days.map((d) => [d.date, []]));
  const dates = new Set(days.map((d) => d.date));
  const free: PlannerPlace[] = [];
  for (const p of places) {
    const pinned = p.lock?.date ?? p.fixedStart?.date ?? p.preferredDate;
    if (pinned && dates.has(pinned)) res.get(pinned)!.push(p);
    else free.push(p);
  }
  const open = days.filter((d) => !d.locked);
  if (!open.length || !free.length) return res;

  const load = (date: string) => res.get(date)!.reduce((n, p) => n + p.visitMinutes + ROUGH_LEG_MIN, 0);
  const cap = (d: PlannerDay) => d.end - d.start - 120; // keep ~2h for meals/slack

  // seeds: hotel/start anchor, else farthest-point initialisation (deterministic)
  const centroids: (LatLng | null)[] = open.map((d) => d.endPoint ?? d.startPoint ?? null);
  const sorted = [...free].sort((a, b) => a.id.localeCompare(b.id));
  for (let i = 0; i < centroids.length; i++) {
    if (centroids[i]) continue;
    const chosen = centroids.filter(Boolean) as LatLng[];
    const far = chosen.length
      ? sorted.reduce((best, p) => (Math.min(...chosen.map((c) => haversineMeters(c, p))) > Math.min(...chosen.map((c) => haversineMeters(c, best))) ? p : best), sorted[0])
      : sorted[0];
    centroids[i] = { lat: far.lat, lng: far.lng };
  }
  const anchored = open.map((d) => Boolean(d.endPoint ?? d.startPoint));

  let assignment = new Map<string, number>();
  for (let iter = 0; iter < 8; iter++) {
    for (const d of open) res.set(d.date, res.get(d.date)!.filter((p) => !free.includes(p)));
    assignment = new Map();
    const queue = [...free].sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.id.localeCompare(b.id));
    for (const p of queue) {
      const ranked = open.map((d, i) => ({ i, dist: haversineMeters(centroids[i]!, p) })).sort((a, b) => a.dist - b.dist);
      const pick = ranked.find(({ i }) => load(open[i].date) + p.visitMinutes + ROUGH_LEG_MIN <= cap(open[i])) ?? ranked[0];
      res.get(open[pick.i].date)!.push(p);
      assignment.set(p.id, pick.i);
    }
    let moved = false;
    open.forEach((d, i) => {
      if (anchored[i]) return;
      const ps = res.get(d.date)!;
      if (!ps.length) return;
      const c = { lat: ps.reduce((s, p) => s + p.lat, 0) / ps.length, lng: ps.reduce((s, p) => s + p.lng, 0) / ps.length };
      if (haversineMeters(c, centroids[i]!) > 50) moved = true;
      centroids[i] = c;
    });
    if (!moved) break;
  }
  return res;
}
