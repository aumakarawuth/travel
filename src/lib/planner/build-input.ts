/** Turn DB rows into planner input. Pure — unit tested. */
import type { Category } from "@/lib/ai/schema";
import type { OpeningPeriod, PlannerDay, PlannerPlace, Priority } from "./types";

export const DEFAULT_VISIT: Record<Category, number> = {
  attraction: 90, cafe: 60, restaurant: 75, accommodation: 0, activity: 120, nature: 120,
  shopping: 90, nightlife: 120, viewpoint: 45, transportation: 30, other: 60,
};

export type HotelRow = { id: string; name: string; lat: number | null; lng: number | null; check_in_date: string; check_out_date: string; status: "proposed" | "confirmed" };
export type PlaceRow = {
  id: string; name: string; category: Category; lat: number | null; lng: number | null; location_verified: boolean;
  visit_duration_minutes: number | null; estimated_price: number | null; opening_hours: { periods?: OpeningPeriod[] | null } | null;
  selection: { status: string; priority: Priority; fixed_start_at: string | null; preferred_day: string | null } | null;
};
export type LockRow = { placeId: string; date: string; position: number };

const TZ_OFFSET_MIN = 7 * 60; // Asia/Bangkok, no DST

export function toLocal(iso: string) {
  const d = new Date(new Date(iso).getTime() + TZ_OFFSET_MIN * 60_000);
  return { date: d.toISOString().slice(0, 10), minute: d.getUTCHours() * 60 + d.getUTCMinutes() };
}
export function localIso(date: string, minute: number) {
  const m = Math.round(minute);
  const dayShift = Math.floor(m / 1440);
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + dayShift);
  const mm = ((m % 1440) + 1440) % 1440;
  return `${base.toISOString().slice(0, 10)}T${String(Math.floor(mm / 60)).padStart(2, "0")}:${String(mm % 60).padStart(2, "0")}:00+07:00`;
}
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export function tripDates(start: string, end: string) {
  const out: string[] = [];
  for (let d = new Date(`${start}T00:00:00Z`); d <= new Date(`${end}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
}

/** Hotel for the night starting on `date` (check_in ≤ date < check_out). Confirmed beats proposed. */
export function hotelForNight(hotels: HotelRow[], date: string) {
  const c = hotels.filter((h) => h.lat !== null && h.lng !== null && h.check_in_date <= date && date < h.check_out_date);
  return c.find((h) => h.status === "confirmed") ?? c[0] ?? null;
}

export function buildDays(trip: { start_date: string; end_date: string; daily_start_time: string; daily_end_time: string }, hotels: HotelRow[], lockedDates: Set<string>): { days: PlannerDay[]; warnings: string[] } {
  const warnings: string[] = [];
  const dates = tripDates(trip.start_date, trip.end_date);
  const days = dates.map((date, i) => {
    const tonight = hotelForNight(hotels, date);
    const lastNight = i > 0 ? hotelForNight(hotels, dates[i - 1]) : null;
    if (tonight?.status === "proposed") warnings.push(`hotel_unconfirmed:${date}`);
    const pt = (h: HotelRow | null) => (h ? { lat: h.lat!, lng: h.lng!, name: h.name, kind: "hotel" as const } : null);
    return {
      date, weekday: new Date(`${date}T00:00:00Z`).getUTCDay(),
      start: toMin(trip.daily_start_time), end: toMin(trip.daily_end_time),
      startPoint: pt(lastNight), endPoint: pt(tonight), locked: lockedDates.has(date),
    };
  });
  return { days, warnings };
}

export function buildPlaces(rows: PlaceRow[], locks: LockRow[]): { places: PlannerPlace[]; noLocation: { placeId: string; name: string }[] } {
  const lockBy = new Map(locks.map((l) => [l.placeId, l]));
  const places: PlannerPlace[] = [];
  const noLocation: { placeId: string; name: string }[] = [];
  for (const r of rows) {
    if (r.category === "accommodation") continue; // hotels are day endpoints, not stops
    if (!r.selection || !["selected", "scheduled"].includes(r.selection.status)) continue;
    if (!r.location_verified || r.lat === null || r.lng === null) { noLocation.push({ placeId: r.id, name: r.name }); continue; }
    const fixed = r.selection.fixed_start_at ? toLocal(r.selection.fixed_start_at) : null;
    const lock = lockBy.get(r.id);
    places.push({
      id: r.id, name: r.name, category: r.category, lat: r.lat, lng: r.lng, priority: r.selection.priority,
      visitMinutes: r.visit_duration_minutes ?? DEFAULT_VISIT[r.category], visitMinutesIsDefault: r.visit_duration_minutes === null,
      cost: r.estimated_price, openingPeriods: r.opening_hours?.periods ?? null,
      fixedStart: fixed, preferredDate: r.selection.preferred_day, lock: lock ? { date: lock.date, position: lock.position } : null,
    });
  }
  return { places, noLocation };
}
