import { buffered } from "./travel";
import { fitVisit, openWindows } from "./hours";
import type { DayPlan, LatLng, PlannerDay, PlannerPlace, PlannerSettings, Stop, TravelFn } from "./types";

export type SimResult = { plan: DayPlan; closed: PlannerPlace[]; fixedConflicts: PlannerPlace[] };

const MEAL_CATEGORIES = new Set(["restaurant"]);

/** Deterministic timeline for an ordered day. Never invents hours: unknown hours produce a note. */
export function simulateDay(day: PlannerDay, seq: PlannerPlace[], travel: TravelFn, s: PlannerSettings): SimResult {
  const stops: Stop[] = [];
  const warnings: string[] = [];
  const closed: PlannerPlace[] = [];
  const fixedConflicts: PlannerPlace[] = [];
  let t = day.start;
  let prev: LatLng | null = day.startPoint;
  let lunch = false, dinner = false;
  let travelMin = 0, visitMin = 0, cost = 0;

  const maybeMeal = (nextIsMeal: boolean) => {
    if (!lunch && t >= s.lunchWindow[0] && t <= s.lunchWindow[1]) {
      lunch = true;
      if (!nextIsMeal) { stops.push({ kind: "meal", label: "lunch", arrive: t, depart: t + s.mealMinutes }); t += s.mealMinutes; }
    } else if (!dinner && day.end > s.dinnerWindow[0] && t >= s.dinnerWindow[0] && t <= s.dinnerWindow[1]) {
      dinner = true;
      if (!nextIsMeal) { stops.push({ kind: "meal", label: "dinner", arrive: t, depart: t + s.mealMinutes }); t += s.mealMinutes; }
    }
  };

  for (const p of seq) {
    maybeMeal(MEAL_CATEGORIES.has(p.category));
    const raw = prev ? travel(prev, p) : { minutes: 0, meters: 0, estimate: false };
    const leg = prev ? buffered(raw, s.trafficBufferPct, s.legBufferMinutes) : raw;
    const arrive = t + leg.minutes;
    const notes: string[] = [];
    let start: number | null;

    if (p.fixedStart && p.fixedStart.date === day.date) {
      start = p.fixedStart.minute;
      if (arrive > start) { fixedConflicts.push(p); notes.push("fixed_late"); start = arrive; }
    } else {
      const w = openWindows(p.openingPeriods, day.weekday);
      if (w === null) notes.push("hours_unknown");
      start = fitVisit(w, arrive, p.visitMinutes);
      if (start === null) { closed.push(p); continue; }
    }
    if (p.visitMinutesIsDefault) notes.push("duration_default");
    if (leg.estimate) notes.push("travel_estimate");

    const depart = start + p.visitMinutes;
    stops.push({ kind: "place", placeId: p.id, name: p.name, arrive, depart, travel: leg, wait: start - arrive, visit: p.visitMinutes, cost: p.cost, locked: Boolean(p.lock), notes });
    travelMin += leg.minutes; visitMin += p.visitMinutes; cost += p.cost ?? 0;
    if (MEAL_CATEGORIES.has(p.category)) { if (start <= s.lunchWindow[1] && depart >= s.lunchWindow[0]) lunch = true; if (depart >= s.dinnerWindow[0]) dinner = true; }
    t = depart;
    prev = p;
  }
  maybeMeal(false);

  let finish = t;
  if (day.endPoint && prev) {
    const leg = buffered(travel(prev, day.endPoint), s.trafficBufferPct, s.legBufferMinutes);
    finish = t + leg.minutes;
    travelMin += leg.minutes;
    stops.push({ kind: "hotel", name: day.endPoint.name, arrive: finish, travel: leg });
  }
  const feasible = finish <= day.end && fixedConflicts.length === 0;
  if (finish > day.end) warnings.push("over_time");
  if (fixedConflicts.length) warnings.push("fixed_conflict");

  return {
    plan: {
      date: day.date, start: day.start, end: day.end, locked: day.locked, startPoint: day.startPoint, endPoint: day.endPoint,
      stops, travelMinutes: travelMin, visitMinutes: visitMin, cost, finish, feasible, warnings, explanation: [], rainPlan: null,
    },
    closed, fixedConflicts,
  };
}
