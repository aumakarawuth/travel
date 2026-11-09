/** Place de-duplication: same Google place id, or same normalised name within a small radius. */

const STOP = /(?<![\p{L}\p{N}])(the|cafe|café|coffee|restaurant|hotel|resort|shop|official)(?![\p{L}\p{N}])|ร้าน|คาเฟ่|โรงแรม|รีสอร์ท|สาขา/gu;

export function normalizeName(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(STOP, " ")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type DedupePlace = { id: string; name_normalized: string; google_place_id: string | null; lat: number | null; lng: number | null };
export type DedupeCandidate = { name: string; googlePlaceId?: string; lat?: number; lng?: number };

export const DUPLICATE_RADIUS_M = 200;

export function findDuplicate(c: DedupeCandidate, places: DedupePlace[]): DedupePlace | null {
  if (c.googlePlaceId) {
    const byId = places.find((p) => p.google_place_id === c.googlePlaceId);
    if (byId) return byId;
  }
  const n = normalizeName(c.name);
  if (!n) return null;
  for (const p of places) {
    if (p.name_normalized !== n) continue;
    const bothHaveCoords = c.lat !== undefined && c.lng !== undefined && p.lat !== null && p.lng !== null;
    if (!bothHaveCoords) {
      // without coordinates, only an exact name match with no conflicting place id counts
      if (!(c.googlePlaceId && p.google_place_id && c.googlePlaceId !== p.google_place_id)) return p;
      continue;
    }
    if (haversineMeters({ lat: c.lat!, lng: c.lng! }, { lat: p.lat!, lng: p.lng! }) <= DUPLICATE_RADIUS_M) return p;
  }
  return null;
}
