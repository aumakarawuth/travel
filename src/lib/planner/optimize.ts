import { assignDays } from "./cluster";
import { cheapestInsertion, nearestNeighbour, twoOpt } from "./order";
import { simulateDay } from "./simulate";
import { openWindows } from "./hours";
import type { DayPlan, PlannerDay, PlannerPlace, PlannerSettings, PlanResult, TravelFn, Unscheduled } from "./types";

const DROP_ORDER = { optional: 0, normal: 1, high: 2, must_visit: 3 } as const;
const OUTDOOR = new Set(["nature", "viewpoint", "activity"]);

/** Order one day's places: locked stops keep their order, others are inserted cheaply; otherwise NN + 2-opt. */
export function orderDay(day: PlannerDay, places: PlannerPlace[], travel: TravelFn): PlannerPlace[] {
  const locked = places.filter((p) => p.lock).sort((a, b) => a.lock!.position - b.lock!.position);
  const rest = places.filter((p) => !p.lock);
  let seq = locked.length
    ? cheapestInsertion(locked, rest, day.startPoint, day.endPoint, travel)
    : twoOpt(nearestNeighbour(rest, day.startPoint, travel), day.startPoint, day.endPoint, travel);
  // fixed-time bookings must appear in time order
  const fixedIdx = seq.map((p, i) => (p.fixedStart ? i : -1)).filter((i) => i >= 0);
  const fixedSorted = fixedIdx.map((i) => seq[i]).sort((a, b) => a.fixedStart!.minute - b.fixedStart!.minute);
  if (fixedIdx.length > 1) { seq = [...seq]; fixedIdx.forEach((i, k) => (seq[i] = fixedSorted[k])); }
  return seq;
}

function explain(plan: DayPlan, placesById: Map<string, PlannerPlace>, s: PlannerSettings, routing: PlanResult["routingSource"]): string[] {
  const visits = plan.stops.filter((x) => x.kind === "place");
  const out: string[] = [];
  if (!visits.length) return ["no_stops"];
  out.push(`cluster:${visits.length}`);
  if (visits.some((v) => v.kind === "place" && v.locked)) out.push("locked_kept");
  else out.push("ordered_nn_2opt");
  if (plan.endPoint?.kind === "hotel") out.push(`ends_hotel:${plan.endPoint.name}`);
  out.push(`buffer:${s.trafficBufferPct}:${s.legBufferMinutes}`);
  if (routing === "estimate" || visits.some((v) => v.kind === "place" && v.travel.estimate)) out.push("travel_estimate");
  const must = visits.filter((v) => v.kind === "place" && placesById.get(v.placeId)?.priority === "must_visit").length;
  if (must) out.push(`must:${must}`);
  return out;
}

/**
 * Hybrid planner, deterministic part: cluster → order → simulate → repair until feasible.
 * Places that cannot fit are returned in `unscheduled` with a reason — never silently dropped.
 */
export function optimizePlan(
  places: PlannerPlace[], days: PlannerDay[], travel: TravelFn, s: PlannerSettings, routing: PlanResult["routingSource"],
  presetAssignment?: Map<string, PlannerPlace[]>,
): PlanResult {
  const unscheduled: Unscheduled[] = [];
  const dates = new Set(days.map((d) => d.date));
  const usable = places.filter((p) => {
    const bad = (p.lock && !dates.has(p.lock.date)) || (p.fixedStart && !dates.has(p.fixedStart.date));
    if (bad) unscheduled.push({ placeId: p.id, name: p.name, reason: "outside_trip_dates" });
    return !bad;
  });
  const byDay = presetAssignment ?? assignDays(usable, days);
  const placesById = new Map(usable.map((p) => [p.id, p]));
  const dayByDate = new Map(days.map((d) => [d.date, d]));
  const plans = new Map<string, DayPlan>();

  const run = (date: string) => {
    const day = dayByDate.get(date)!;
    const seq = orderDay(day, byDay.get(date)!, travel);
    return simulateDay(day, seq, travel, s);
  };

  const pending: PlannerPlace[] = [];
  for (const d of days) {
    let r = run(d.date);
    // closed that day → try elsewhere later
    for (const c of r.closed) { byDay.set(d.date, byDay.get(d.date)!.filter((p) => p !== c)); pending.push(c); }
    if (r.closed.length) r = run(d.date);
    // over time → drop least important unlocked/unfixed, one at a time
    while (!r.plan.feasible && !d.locked) {
      const candidates = byDay.get(d.date)!.filter((p) => !p.lock && !p.fixedStart)
        .sort((a, b) => DROP_ORDER[a.priority] - DROP_ORDER[b.priority] || b.visitMinutes - a.visitMinutes || a.id.localeCompare(b.id));
      if (!candidates.length) break;
      const drop = candidates[0];
      byDay.set(d.date, byDay.get(d.date)!.filter((p) => p !== drop));
      pending.push(drop);
      r = run(d.date);
    }
    plans.set(d.date, r.plan);
    for (const f of r.fixedConflicts) r.plan.warnings.push(`fixed_late:${f.name}`);
  }

  // second chance: insert dropped/closed places into any day that stays feasible (most important first)
  pending.sort((a, b) => DROP_ORDER[b.priority] - DROP_ORDER[a.priority]);
  for (const p of pending) {
    let placed = false;
    const order = [...days].filter((d) => !d.locked)
      .sort((a, b) => (plans.get(b.date)!.end - plans.get(b.date)!.finish) - (plans.get(a.date)!.end - plans.get(a.date)!.finish));
    for (const d of order) {
      byDay.get(d.date)!.push(p);
      const r = run(d.date);
      if (r.plan.feasible && !r.closed.includes(p)) { plans.set(d.date, r.plan); placed = true; break; }
      byDay.set(d.date, byDay.get(d.date)!.filter((x) => x !== p));
    }
    if (!placed) {
      const everClosed = days.every((d) => { const w = openWindows(p.openingPeriods, d.weekday); return w !== null && w.length === 0; });
      unscheduled.push({ placeId: p.id, name: p.name, reason: everClosed ? "closed" : "not_enough_time" });
    }
  }

  const result: DayPlan[] = days.map((d) => {
    const plan = plans.get(d.date)!;
    plan.explanation = explain(plan, placesById, s, routing);
    plan.rainPlan = plan.stops.filter((x) => x.kind === "place" && !OUTDOOR.has(placesById.get(x.placeId)!.category)).map((x) => (x as { placeId: string }).placeId);
    if (plan.stops.some((x) => x.kind === "place" && x.notes.includes("hours_unknown"))) plan.warnings.push("hours_unknown");
    return plan;
  });
  return {
    days: result, unscheduled, routingSource: routing,
    totals: result.reduce((t, d) => ({ travelMinutes: t.travelMinutes + d.travelMinutes, visitMinutes: t.visitMinutes + d.visitMinutes, cost: t.cost + d.cost }), { travelMinutes: 0, visitMinutes: 0, cost: 0 }),
  };
}

/** Rebuild timelines for a user-edited order (drag & drop) without re-optimising. */
export function resimulate(days: PlannerDay[], ordered: Map<string, PlannerPlace[]>, travel: TravelFn, s: PlannerSettings, routing: PlanResult["routingSource"]): PlanResult {
  const placesById = new Map([...ordered.values()].flat().map((p) => [p.id, p]));
  const dayPlans = days.map((d) => {
    const r = simulateDay(d, ordered.get(d.date) ?? [], travel, s);
    for (const c of r.closed) r.plan.warnings.push(`closed:${c.name}`);
    for (const f of r.fixedConflicts) r.plan.warnings.push(`fixed_late:${f.name}`);
    r.plan.explanation = ["manual_order", ...(routing === "estimate" ? ["travel_estimate"] : [])];
    r.plan.rainPlan = r.plan.stops.filter((x) => x.kind === "place" && !OUTDOOR.has(placesById.get(x.placeId)!.category)).map((x) => (x as { placeId: string }).placeId);
    if (r.closed.length) r.plan.feasible = false;
    return r.plan;
  });
  return {
    days: dayPlans, unscheduled: [], routingSource: routing,
    totals: dayPlans.reduce((t, d) => ({ travelMinutes: t.travelMinutes + d.travelMinutes, visitMinutes: t.visitMinutes + d.visitMinutes, cost: t.cost + d.cost }), { travelMinutes: 0, visitMinutes: 0, cost: 0 }),
  };
}
