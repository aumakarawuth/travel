import type { LatLng, TravelMode } from "./types";

/**
 * Google Maps URLs (https://developers.google.com/maps/documentation/urls) allow up to 9 waypoints,
 * but only 3 on mobile browsers. We default to 3 and chain segments: each segment's destination is
 * the next segment's origin, so the whole day stays continuous.
 */
export const MOBILE_SAFE_WAYPOINTS = 3;

export type RoutePoint = LatLng & { name: string; placeId?: string | null };

const MODE: Record<TravelMode, string> = { car: "driving", motorbike: "two-wheeler", public_transit: "transit", walking: "walking", bicycle: "bicycling", mixed: "driving" };
const ll = (p: LatLng) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

export function directionsSegments(points: RoutePoint[], mode: TravelMode, maxWaypoints = MOBILE_SAFE_WAYPOINTS): string[] {
  if (points.length < 2) return [];
  const per = maxWaypoints + 2; // origin + waypoints + destination
  const urls: string[] = [];
  for (let i = 0; i < points.length - 1; i += per - 1) {
    const seg = points.slice(i, i + per);
    if (seg.length < 2) break;
    const o = seg[0], d = seg[seg.length - 1], w = seg.slice(1, -1);
    const q = new URLSearchParams({ api: "1", origin: ll(o), destination: ll(d), travelmode: MODE[mode] });
    if (o.placeId) q.set("origin_place_id", o.placeId);
    if (d.placeId) q.set("destination_place_id", d.placeId);
    if (w.length) {
      q.set("waypoints", w.map(ll).join("|"));
      if (w.every((x) => x.placeId)) q.set("waypoint_place_ids", w.map((x) => x.placeId).join("|"));
    }
    urls.push(`https://www.google.com/maps/dir/?${q.toString()}`);
  }
  return urls;
}

export function hhmm(min: number) {
  const m = Math.max(0, Math.round(min));
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function durationText(min: number, locale: "th" | "en" = "th") {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  if (locale === "th") return h ? `${h} ชม.${m ? ` ${m} นาที` : ""}` : `${m} นาที`;
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}

/** "วันที่ 1: ออกเดินทางจากโรงแรม X 09:00 → A → B → กลับโรงแรม X 18:00" */
export function thaiDaySummary(index: number, d: {
  start: number; startPoint: { name: string; kind: string } | null; endPoint: { name: string; kind: string } | null;
  stops: ({ kind: "place"; name: string; arrive: number } | { kind: "meal"; label: string } | { kind: "hotel"; name: string; arrive: number })[];
  finish: number;
}) {
  const places = d.stops.filter((s): s is { kind: "place"; name: string; arrive: number } => s.kind === "place");
  const parts: string[] = [];
  let rest = places;
  if (d.startPoint) parts.push(`วันที่ ${index + 1}: ออกเดินทางจาก${d.startPoint.kind === "hotel" ? "โรงแรม " : ""}${d.startPoint.name} ${hhmm(d.start)}`);
  else if (places[0]) { parts.push(`วันที่ ${index + 1}: เริ่มที่${places[0].name} ${hhmm(places[0].arrive)}`); rest = places.slice(1); }
  else parts.push(`วันที่ ${index + 1}: ${hhmm(d.start)}`);
  for (const p of rest) parts.push(p.name);
  parts.push(d.endPoint ? `${d.endPoint.kind === "hotel" ? "กลับโรงแรม " : "ถึง "}${d.endPoint.name} ${hhmm(d.finish)}` : `จบวัน ${hhmm(d.finish)}`);
  return parts.join(" → ");
}
