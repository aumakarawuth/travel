import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildDays, buildPlaces, localIso, type HotelRow, type LockRow, type PlaceRow } from "./build-input";
import { makeTravelFn } from "./travel";
import { optimizePlan, resimulate } from "./optimize";
import { fetchMatrices } from "./google-routes";
import { DEFAULT_SETTINGS, type PlannerPlace, type PlannerSettings, type PlanResult, type TravelMode } from "./types";
import { log } from "@/lib/log";

export type StoredPlan = PlanResult & { warnings: string[]; settings: PlannerSettings; placeMeta: Record<string, { lat: number; lng: number; googlePlaceId: string | null; category: string; sourceUrl: string | null }> };

async function loadInputs(supabase: SupabaseClient, tripId: string) {
  const [{ data: trip }, { data: placeRows }, { data: hotels }, { data: active }] = await Promise.all([
    supabase.from("trips").select("id,start_date,end_date,daily_start_time,daily_end_time,travel_mode").eq("id", tripId).single(),
    supabase.from("places").select("id,name,category,lat,lng,location_verified,visit_duration_minutes,estimated_price,opening_hours,google_place_id,trip_place_selections(status,priority,fixed_start_at,preferred_day),place_submissions(submission:link_submissions(original_url))").eq("trip_id", tripId),
    supabase.from("accommodations").select("id,name,lat,lng,check_in_date,check_out_date,status").eq("trip_id", tripId),
    supabase.from("itinerary_versions").select("id,version").eq("trip_id", tripId).eq("is_active", true).maybeSingle(),
  ]);
  if (!trip) throw new Error("trip_not_found");
  let locks: LockRow[] = [];
  const lockedDates = new Set<string>();
  if (active) {
    const { data: days } = await supabase.from("itinerary_days").select("id,date,locked,itinerary_stops(place_id,position,locked)").eq("version_id", active.id).eq("is_rain_plan", false);
    for (const d of days ?? []) {
      if (d.locked) lockedDates.add(d.date);
      const stops = (d.itinerary_stops as { place_id: string | null; position: number; locked: boolean }[]).filter((s) => s.place_id).sort((a, b) => a.position - b.position);
      stops.forEach((s, i) => { if (d.locked || s.locked) locks.push({ placeId: s.place_id!, date: d.date, position: i }); });
    }
  }
  const rows = (placeRows ?? []).map((r) => ({ ...r, selection: (r.trip_place_selections as PlaceRow["selection"][])[0] ?? null })) as unknown as (PlaceRow & { google_place_id: string | null; place_submissions: { submission: { original_url: string } | null }[] })[];
  const placeMeta = Object.fromEntries(rows.filter((r) => r.lat !== null && r.lng !== null).map((r) => [r.id, {
    lat: r.lat!, lng: r.lng!, googlePlaceId: r.google_place_id, category: r.category, sourceUrl: r.place_submissions[0]?.submission?.original_url ?? null,
  }]));
  locks = locks.filter((l) => rows.some((r) => r.id === l.placeId));
  return { trip, rows, hotels: (hotels ?? []) as HotelRow[], locks, lockedDates, active, placeMeta };
}

async function travelFor(days: { startPoint: { lat: number; lng: number } | null; endPoint: { lat: number; lng: number } | null }[], groups: PlannerPlace[][], mode: TravelMode) {
  const pointGroups = groups.map((ps, i) => [...(days[i].startPoint ? [days[i].startPoint!] : []), ...ps, ...(days[i].endPoint ? [days[i].endPoint!] : [])]);
  const { matrix, used } = await fetchMatrices(pointGroups, mode);
  return { travel: makeTravelFn(mode, matrix), routing: used ? ("google_routes" as const) : ("estimate" as const) };
}

/** Full (re-)optimisation. Locked days/stops from the active version are kept. */
export async function generatePlan(supabase: SupabaseClient, userId: string, tripId: string, overrides: Partial<PlannerSettings> = {}) {
  const inp = await loadInputs(supabase, tripId);
  const settings: PlannerSettings = { ...DEFAULT_SETTINGS, travelMode: inp.trip.travel_mode as TravelMode, ...overrides };
  const { days, warnings } = buildDays(inp.trip, inp.hotels, inp.lockedDates);
  const { places, noLocation } = buildPlaces(inp.rows, inp.locks);

  // pass 1: straight-line estimates decide which day each place belongs to
  const est = makeTravelFn(settings.travelMode);
  const draft = optimizePlan(places, days, est, settings, "estimate");
  const groups = draft.days.map((d) => d.stops.flatMap((s) => (s.kind === "place" ? [places.find((p) => p.id === s.placeId)!] : [])));
  // pass 2: real road times for those groups when Routes API is configured
  const { travel, routing } = await travelFor(days, groups, settings.travelMode);
  const plan = routing === "estimate" ? draft : optimizePlan(places, days, travel, settings, routing);
  plan.unscheduled.push(...noLocation.map((n) => ({ ...n, reason: "no_location" as const })));
  return savePlan(supabase, userId, tripId, { ...plan, warnings, settings, placeMeta: inp.placeMeta }, "auto");
}

/** User drag & drop: keep the given order exactly, recompute times and re-check feasibility. */
export async function saveManualOrder(supabase: SupabaseClient, userId: string, tripId: string, order: Record<string, string[]>, lockedDays: string[], lockedStops: string[]) {
  const inp = await loadInputs(supabase, tripId);
  const { data: last } = inp.active
    ? await supabase.from("itinerary_versions").select("input_snapshot").eq("id", inp.active.id).single()
    : { data: null };
  const settings: PlannerSettings = { ...DEFAULT_SETTINGS, travelMode: inp.trip.travel_mode as TravelMode, ...((last?.input_snapshot as { settings?: PlannerSettings })?.settings ?? {}) };
  const { days, warnings } = buildDays(inp.trip, inp.hotels, new Set(lockedDays));
  const all = buildPlaces(inp.rows.map((r) => ({ ...r, selection: r.selection ?? { status: "selected", priority: "normal", fixed_start_at: null, preferred_day: null } })), []).places;
  const byId = new Map(all.map((p) => [p.id, p]));
  const ordered = new Map<string, PlannerPlace[]>();
  for (const d of days) {
    ordered.set(d.date, (order[d.date] ?? []).map((id, i) => {
      const p = byId.get(id);
      return p ? { ...p, lock: lockedStops.includes(id) || lockedDays.includes(d.date) ? { date: d.date, position: i } : null } : null;
    }).filter((p): p is PlannerPlace => p !== null));
  }
  const { travel, routing } = await travelFor(days, days.map((d) => ordered.get(d.date)!), settings.travelMode);
  const plan = resimulate(days, ordered, travel, settings, routing);
  const scheduled = new Set([...ordered.values()].flat().map((p) => p.id));
  const prevUnscheduled = ((last?.input_snapshot as { result?: StoredPlan })?.result?.unscheduled ?? []).filter((u) => !scheduled.has(u.placeId));
  plan.unscheduled.push(...prevUnscheduled);
  return savePlan(supabase, userId, tripId, { ...plan, warnings, settings, placeMeta: inp.placeMeta }, "manual");
}

async function savePlan(supabase: SupabaseClient, userId: string, tripId: string, plan: StoredPlan, label: "auto" | "manual") {
  const { data: maxRow } = await supabase.from("itinerary_versions").select("version").eq("trip_id", tripId).order("version", { ascending: false }).limit(1).maybeSingle();
  const version = (maxRow?.version ?? 0) + 1;
  // deactivate old (kept for history), then insert the new active version
  await supabase.from("itinerary_versions").update({ is_active: false }).eq("trip_id", tripId).eq("is_active", true);
  const { data: v, error } = await supabase.from("itinerary_versions").insert({
    trip_id: tripId, version, label, is_active: true, algorithm: "greedy_kmeans_nn_2opt", routing_source: plan.routingSource,
    input_snapshot: { settings: plan.settings, result: plan }, explanation: null, unscheduled: plan.unscheduled, created_by: userId,
  }).select("id").single();
  if (error) throw error;

  for (const [i, d] of plan.days.entries()) {
    const { data: day, error: e2 } = await supabase.from("itinerary_days").insert({
      trip_id: tripId, version_id: v.id, day_index: i, date: d.date,
      start_time: `${String(Math.floor(d.start / 60)).padStart(2, "0")}:${String(d.start % 60).padStart(2, "0")}`,
      end_time: `${String(Math.floor(d.end / 60)).padStart(2, "0")}:${String(d.end % 60).padStart(2, "0")}`,
      locked: d.locked,
    }).select("id").single();
    if (e2) throw e2;
    const stops = d.stops.flatMap((s, k): Record<string, unknown>[] => s.kind === "place" ? [{
      trip_id: tripId, day_id: day.id, place_id: s.placeId, position: k, stop_kind: "place", label: s.name,
      arrive_at: localIso(d.date, s.arrive), depart_at: localIso(d.date, s.depart), travel_minutes_from_prev: s.travel.minutes,
      travel_meters_from_prev: s.travel.meters, travel_is_estimate: s.travel.estimate, visit_minutes: s.visit, estimated_cost: s.cost, locked: s.locked,
      note: s.notes.join(",") || null,
    }] : s.kind === "meal" ? [{ trip_id: tripId, day_id: day.id, position: k, stop_kind: "meal", label: s.label, arrive_at: localIso(d.date, s.arrive), depart_at: localIso(d.date, s.depart) }]
      : [{ trip_id: tripId, day_id: day.id, position: k, stop_kind: "hotel", label: s.name, arrive_at: localIso(d.date, s.arrive), travel_minutes_from_prev: s.travel.minutes, travel_meters_from_prev: s.travel.meters, travel_is_estimate: s.travel.estimate }]);
    if (stops.length) { const { error: e3 } = await supabase.from("itinerary_stops").insert(stops); if (e3) throw e3; }
  }

  // selection status: scheduled ⇄ selected (never deletes anything)
  const scheduled = plan.days.flatMap((d) => d.stops.flatMap((s) => (s.kind === "place" ? [s.placeId] : [])));
  if (scheduled.length) await supabase.from("trip_place_selections").update({ status: "scheduled", updated_by: userId }).eq("trip_id", tripId).in("place_id", scheduled);
  const back = plan.unscheduled.map((u) => u.placeId);
  if (back.length) await supabase.from("trip_place_selections").update({ status: "selected", updated_by: userId }).eq("trip_id", tripId).eq("status", "scheduled").in("place_id", back);
  log.info("plan_saved", { tripId, version, label, routing: plan.routingSource, days: plan.days.length, unscheduled: plan.unscheduled.length });
  return { versionId: v.id as string, version };
}
