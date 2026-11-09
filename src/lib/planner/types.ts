/** Planner domain types. Times are minutes since local midnight (trip timezone, Asia/Bangkok). */
import type { Category } from "@/lib/ai/schema";

export type LatLng = { lat: number; lng: number };
export type TravelMode = "car" | "motorbike" | "public_transit" | "walking" | "bicycle" | "mixed";
export type Priority = "must_visit" | "high" | "normal" | "optional";

/** Google Places `regularOpeningHours.periods` shape (day 0 = Sunday). */
export type OpeningPeriod = { open: { day: number; hour: number; minute: number }; close?: { day: number; hour: number; minute: number } };

export type PlannerPlace = LatLng & {
  id: string; name: string; category: Category; priority: Priority;
  visitMinutes: number; visitMinutesIsDefault: boolean;
  cost: number | null;
  openingPeriods: OpeningPeriod[] | null; // null = unknown (never guessed)
  fixedStart: { date: string; minute: number } | null; // booked activity time
  preferredDate: string | null;
  lock: { date: string; position: number } | null; // user-locked placement
};

export type PlannerDay = {
  date: string; weekday: number; // 0 = Sunday
  start: number; end: number; // e.g. 540 = 09:00
  startPoint: (LatLng & { name: string; kind: "hotel" | "start" }) | null;
  endPoint: (LatLng & { name: string; kind: "hotel" | "end" }) | null;
  locked: boolean;
};

export type PlannerSettings = {
  mealMinutes: number; // lunch & dinner each
  lunchWindow: [number, number]; // insert lunch when crossing this window
  dinnerWindow: [number, number];
  trafficBufferPct: number; // extra % on every leg
  legBufferMinutes: number; // parking / walking per stop
  travelMode: TravelMode;
};

export const DEFAULT_SETTINGS: PlannerSettings = {
  mealMinutes: 60, lunchWindow: [11 * 60 + 30, 13 * 60 + 30], dinnerWindow: [18 * 60, 20 * 60],
  trafficBufferPct: 15, legBufferMinutes: 10, travelMode: "car",
};

export type Leg = { minutes: number; meters: number; estimate: boolean };
export type TravelFn = (a: LatLng, b: LatLng) => Leg;

export type Stop =
  | { kind: "place"; placeId: string; name: string; arrive: number; depart: number; travel: Leg; wait: number; visit: number; cost: number | null; locked: boolean; notes: string[] }
  | { kind: "meal"; label: "lunch" | "dinner"; arrive: number; depart: number }
  | { kind: "hotel"; name: string; arrive: number; travel: Leg };

export type DayPlan = {
  date: string; start: number; end: number; locked: boolean;
  startPoint: PlannerDay["startPoint"]; endPoint: PlannerDay["endPoint"];
  stops: Stop[]; travelMinutes: number; visitMinutes: number; cost: number; finish: number;
  feasible: boolean; warnings: string[]; explanation: string[];
  rainPlan: string[] | null; // place ids kept on a rainy day (indoor only)
};

export type Unscheduled = { placeId: string; name: string; reason: "no_location" | "not_enough_time" | "closed" | "fixed_time_conflict" | "outside_trip_dates" };

export type PlanResult = {
  days: DayPlan[]; unscheduled: Unscheduled[]; routingSource: "google_routes" | "estimate";
  totals: { travelMinutes: number; visitMinutes: number; cost: number };
};
