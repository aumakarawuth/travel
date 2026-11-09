import type { Leg, LatLng, TravelMode } from "./types";
import { haversineMeters } from "@/lib/pipeline/dedupe";

/** Conservative average door-to-door speeds (km/h) used ONLY when real routing is unavailable. */
const SPEED: Record<TravelMode, number> = { car: 35, motorbike: 30, public_transit: 18, walking: 4.5, bicycle: 12, mixed: 25 };
/** Roads are longer than straight lines. */
export const DETOUR_FACTOR = 1.35;

/** Straight-line estimate, always flagged `estimate: true` so the UI says so. */
export function estimateLeg(a: LatLng, b: LatLng, mode: TravelMode): Leg {
  const meters = Math.round(haversineMeters(a, b) * DETOUR_FACTOR);
  const minutes = meters < 30 ? 0 : Math.max(3, Math.round((meters / 1000 / SPEED[mode]) * 60));
  return { minutes, meters, estimate: true };
}

/** Wraps a precomputed matrix (e.g. Google Routes) with estimate fallback for missing pairs. */
export function makeTravelFn(mode: TravelMode, matrix?: Map<string, Leg>) {
  const key = (p: LatLng) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
  return (a: LatLng, b: LatLng): Leg => matrix?.get(`${key(a)}>${key(b)}`) ?? estimateLeg(a, b, mode);
}

export function matrixKey(a: LatLng, b: LatLng) {
  return `${a.lat.toFixed(6)},${a.lng.toFixed(6)}>${b.lat.toFixed(6)},${b.lng.toFixed(6)}`;
}

/** Apply traffic % and fixed per-leg buffer. */
export function buffered(leg: Leg, pct: number, fixed: number): Leg {
  if (leg.minutes === 0 && leg.meters < 30) return leg;
  return { ...leg, minutes: Math.ceil(leg.minutes * (1 + pct / 100)) + fixed };
}
