import "server-only";

export type PlaceCandidate = {
  googlePlaceId: string; name: string; address?: string; lat: number; lng: number;
  types: string[]; rating?: number; mapsUri?: string;
  openingHours?: string[]; openingPeriods?: unknown[]; priceLevel?: string;
};

export function placesAvailable() {
  return Boolean(process.env.GOOGLE_MAPS_SERVER_KEY);
}

/** Places API (New) Text Search with a narrow field mask (cost control). Returns [] when no key is configured. */
export async function searchPlaces(query: string, bias?: { lat: number; lng: number }): Promise<PlaceCandidate[]> {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key || !query.trim()) return [];
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    signal: AbortSignal.timeout(8000),
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": key,
      "x-goog-fieldmask": "places.id,places.displayName,places.formattedAddress,places.location,places.types,places.rating,places.googleMapsUri,places.regularOpeningHours.weekdayDescriptions,places.regularOpeningHours.periods,places.priceLevel",
    },
    body: JSON.stringify({
      textQuery: query.slice(0, 200), languageCode: "th", regionCode: "TH", pageSize: 5,
      ...(bias ? { locationBias: { circle: { center: { latitude: bias.lat, longitude: bias.lng }, radius: 20000 } } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`places_${res.status}`);
  const j = await res.json();
  return (j.places ?? []).map((p: Record<string, any>) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
    googlePlaceId: p.id, name: p.displayName?.text ?? "", address: p.formattedAddress,
    lat: p.location?.latitude, lng: p.location?.longitude, types: p.types ?? [], rating: p.rating,
    mapsUri: p.googleMapsUri, openingHours: p.regularOpeningHours?.weekdayDescriptions, openingPeriods: p.regularOpeningHours?.periods, priceLevel: p.priceLevel,
  })).filter((c: PlaceCandidate) => c.googlePlaceId && Number.isFinite(c.lat) && Number.isFinite(c.lng));
}
