/** Pure decision logic: combine evidence + AI + Places into an ExtractionResult. No I/O. */
import type { AiExtraction, ExtractionResult } from "@/lib/ai/schema";
import { normalizeName } from "./dedupe";

export type DecideInput = {
  originalUrl: string;
  resolvedUrl: string;
  platform: string;
  evidenceText: string;
  evidence: ExtractionResult["sourceEvidence"];
  image?: { url: string; source: string };
  maps?: { name?: string; lat?: number; lng?: number; placeId?: string; precise: boolean } | null;
  pageGeo?: { lat: number; lng: number };
  ai: AiExtraction | null;
  aiProvider: string;
  isMock: boolean;
  candidates: { googlePlaceId: string; name: string; address?: string; lat: number; lng: number; openingHours?: string[] }[];
  placesChecked: boolean;
  now: Date;
};

export const AUTO_CONFIRM_CONFIDENCE = 0.75;

/** A Places candidate is accepted automatically only if it is the sole result or clearly matches the extracted name. */
export function pickCandidate(name: string | undefined, candidates: DecideInput["candidates"]) {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  if (!name) return null;
  const n = normalizeName(name);
  const exact = candidates.filter((c) => normalizeName(c.name) === n);
  return exact.length === 1 ? exact[0] : null;
}

/** Keep a price only if the quoted text literally exists in the evidence and contains that number. */
export function verifiedPrice(ai: AiExtraction | null, evidenceText: string) {
  if (!ai?.estimatedPrice || !ai.priceEvidenceQuote) return null;
  const quote = ai.priceEvidenceQuote.trim();
  if (!quote || !evidenceText.includes(quote)) return null;
  const digits = quote.replace(/[,\s]/g, "");
  if (!digits.includes(String(Math.round(ai.estimatedPrice)))) return null;
  return { amount: ai.estimatedPrice, currency: ai.currency ?? "THB", quote };
}

export function decide(i: DecideInput): ExtractionResult {
  const ai = i.ai;
  const name = i.maps?.name ?? ai?.placeName;
  const chosen = pickCandidate(name, i.candidates);
  const missing = new Set<string>(ai?.missingFields ?? []);

  let lat: number | undefined, lng: number | undefined, googlePlaceId: string | undefined, address = ai?.address;
  let locationVerified = false;
  if (chosen) {
    ({ lat, lng, googlePlaceId } = chosen);
    address = chosen.address ?? address;
    locationVerified = true;
  } else if (i.maps?.lat !== undefined && i.maps.precise) {
    lat = i.maps.lat; lng = i.maps.lng; googlePlaceId = i.maps.placeId; locationVerified = true;
  } else if (i.pageGeo) {
    lat = i.pageGeo.lat; lng = i.pageGeo.lng; // from page markup: shown, but still reviewed
  }
  if (lat === undefined) missing.add("location");
  if (!name && !chosen) missing.add("placeName");

  const price = verifiedPrice(ai, i.evidenceText);
  if (!price) missing.add("price");

  let confidence = ai?.confidenceScore ?? 0;
  if (i.maps?.precise) confidence = Math.max(confidence, 0.85);
  if (chosen && i.candidates.length === 1) confidence = Math.max(confidence, Math.min(0.9, confidence + 0.2));
  // A precise pin + name taken straight from a Google Maps URL needs no AI judgement.
  const deterministic = Boolean(!chosen && i.maps?.precise && i.maps.name && lat !== undefined);
  if (i.isMock && !deterministic) confidence = Math.min(confidence, 0.3);

  const status: ExtractionResult["extractionStatus"] =
    deterministic || ((chosen?.name || name) && locationVerified && confidence >= AUTO_CONFIRM_CONFIDENCE && !i.isMock) ? "completed" : "needs_review";

  return {
    detectedPlatform: i.platform,
    originalUrl: i.originalUrl,
    resolvedUrl: i.resolvedUrl,
    placeName: chosen?.name ?? name,
    placeType: ai?.placeType,
    category: ai?.category ?? "other",
    description: ai?.description,
    address,
    latitude: lat,
    longitude: lng,
    googlePlaceId,
    estimatedPrice: price?.amount,
    currency: price?.currency,
    priceSource: price ? `${i.resolvedUrl} — "${price.quote}" (ตรวจ ${i.now.toISOString().slice(0, 10)})` : undefined,
    suggestedVisitDurationMinutes: ai?.suggestedVisitDurationMinutes,
    openingHours: chosen?.openingHours ? { weekdayText: chosen.openingHours, source: "google_places", checkedAt: i.now.toISOString() } : undefined,
    images: i.image ? [i.image] : [],
    sourceEvidence: i.evidence,
    confidenceScore: Math.round(confidence * 100) / 100,
    extractionStatus: status,
    missingFields: [...missing],
    provider: i.aiProvider,
    isMock: i.isMock,
  };
}
