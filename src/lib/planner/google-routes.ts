import "server-only";
import { matrixKey } from "./travel";
import type { Leg, LatLng, TravelMode } from "./types";
import { log } from "@/lib/log";

const MODE: Record<TravelMode, string> = { car: "DRIVE", motorbike: "TWO_WHEELER", public_transit: "TRANSIT", walking: "WALK", bicycle: "BICYCLE", mixed: "DRIVE" };
export const MAX_POINTS_PER_MATRIX = 25; // 625 elements = Routes API limit for DRIVE without traffic
const MAX_ELEMENTS_PER_PLAN = Number(process.env.PLANNER_MAX_MATRIX_ELEMENTS ?? 2000); // cost guardrail

export function routesAvailable() {
  return Boolean(process.env.GOOGLE_MAPS_SERVER_KEY);
}

/** Routes API computeRouteMatrix → Map keyed by matrixKey(a,b). Pairs that fail are simply absent (caller estimates). */
export async function fetchMatrices(groups: LatLng[][], mode: TravelMode): Promise<{ matrix: Map<string, Leg>; used: boolean }> {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  const matrix = new Map<string, Leg>();
  if (!key) return { matrix, used: false };
  let budget = MAX_ELEMENTS_PER_PLAN;
  let used = false;
  for (const raw of groups) {
    const pts = dedupe(raw).slice(0, MAX_POINTS_PER_MATRIX);
    const n = pts.length * pts.length;
    if (pts.length < 2 || n > budget) continue;
    budget -= n;
    const wp = pts.map((p) => ({ waypoint: { location: { latLng: { latitude: p.lat, longitude: p.lng } } } }));
    try {
      const res = await fetch("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix", {
        method: "POST", signal: AbortSignal.timeout(15_000),
        headers: { "content-type": "application/json", "x-goog-api-key": key, "x-goog-fieldmask": "originIndex,destinationIndex,duration,distanceMeters,condition" },
        body: JSON.stringify({ origins: wp, destinations: wp, travelMode: MODE[mode], ...(MODE[mode] === "DRIVE" || MODE[mode] === "TWO_WHEELER" ? { routingPreference: "TRAFFIC_UNAWARE" } : {}) }),
      });
      if (!res.ok) { log.warn("routes_matrix_http", { status: res.status }); continue; }
      const rows = (await res.json()) as { originIndex: number; destinationIndex: number; duration?: string; distanceMeters?: number; condition?: string }[];
      for (const r of rows) {
        if (r.condition !== "ROUTE_EXISTS" || !r.duration) continue;
        const sec = Number(r.duration.replace("s", ""));
        matrix.set(matrixKey(pts[r.originIndex], pts[r.destinationIndex]), { minutes: Math.round(sec / 60), meters: r.distanceMeters ?? 0, estimate: false });
      }
      used = true;
    } catch (e) {
      log.warn("routes_matrix_failed", { e: String(e) });
    }
  }
  return { matrix, used };
}

function dedupe(pts: LatLng[]) {
  const seen = new Set<string>();
  return pts.filter((p) => { const k = `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`; if (seen.has(k)) return false; seen.add(k); return true; });
}
