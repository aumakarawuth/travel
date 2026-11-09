/** Parse place info that Google Maps URLs carry directly (deterministic — preferred over AI). */
export type MapsUrlInfo = { name?: string; lat?: number; lng?: number; placeId?: string; query?: string; precise: boolean };

const valid = (lat: number, lng: number) => Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

export function parseGoogleMapsUrl(raw: string): MapsUrlInfo | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  const host = u.hostname.replace(/^www\./, "");
  if (!/(^|\.)google\.[a-z.]+$/.test(host) && host !== "maps.google.com") return null;
  if (!u.pathname.startsWith("/maps") && host !== "maps.google.com") return null;
  const info: MapsUrlInfo = { precise: false };
  const path = decodeURIComponent(u.pathname);

  const place = path.match(/\/maps\/place\/([^/]+)/);
  if (place) info.name = place[1].replace(/\+/g, " ").trim();

  // !3d<lat>!4d<lng> is the actual pin; @lat,lng is only the viewport centre
  const pin = raw.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (pin && valid(+pin[1], +pin[2])) { info.lat = +pin[1]; info.lng = +pin[2]; info.precise = true; }
  else {
    const at = path.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (at && valid(+at[1], +at[2])) { info.lat = +at[1]; info.lng = +at[2]; }
  }

  const q = u.searchParams.get("q") ?? u.searchParams.get("query") ?? u.searchParams.get("destination");
  if (q) {
    const ll = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (ll && valid(+ll[1], +ll[2])) { info.lat = +ll[1]; info.lng = +ll[2]; info.precise = true; }
    else info.query = q.trim();
  }
  const pid = u.searchParams.get("query_place_id") ?? u.searchParams.get("place_id") ?? u.searchParams.get("destination_place_id");
  if (pid && /^[A-Za-z0-9_-]{10,}$/.test(pid)) info.placeId = pid;
  if (!info.name && info.query) info.name = info.query;
  return info.name || info.lat !== undefined || info.placeId ? info : null;
}
