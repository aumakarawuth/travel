import { describe, expect, it } from "vitest";
import { findDuplicate, haversineMeters, normalizeName } from "@/lib/pipeline/dedupe";
import { decide, pickCandidate, verifiedPrice, type DecideInput } from "@/lib/pipeline/decide";
import { aiExtractionSchema } from "@/lib/ai/schema";

describe("dedupe", () => {
  it("normalises names across case, punctuation and generic words", () => {
    expect(normalizeName("The Barn: Eatery & Design")).toBe(normalizeName("barn eatery design"));
    expect(normalizeName("ร้าน กาแฟ ดอย")).toBe(normalizeName("กาแฟดอย"));
    expect(normalizeName("Café Amazon")).toBe(normalizeName("amazon"));
  });
  it("haversine ~ 111km per degree latitude", () => {
    expect(Math.round(haversineMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }) / 1000)).toBe(111);
  });
  const places = [
    { id: "p1", name_normalized: normalizeName("Wat Arun"), google_place_id: "G1", lat: 13.7437, lng: 100.4888 },
    { id: "p2", name_normalized: normalizeName("Starbucks"), google_place_id: null, lat: 13.70, lng: 100.50 },
    { id: "p3", name_normalized: normalizeName("Night Market"), google_place_id: null, lat: null, lng: null },
  ];
  it("matches by place id first", () => expect(findDuplicate({ name: "anything", googlePlaceId: "G1" }, places)?.id).toBe("p1"));
  it("matches same name nearby", () => expect(findDuplicate({ name: "STARBUCKS", lat: 13.7005, lng: 100.5005 }, places)?.id).toBe("p2"));
  it("does not merge same-name branches far apart", () => expect(findDuplicate({ name: "Starbucks", lat: 18.79, lng: 98.98 }, places)).toBeNull());
  it("merges exact name when coordinates are missing", () => expect(findDuplicate({ name: "night market" }, places)?.id).toBe("p3"));
  it("no match for new place", () => expect(findDuplicate({ name: "Doi Inthanon" }, places)).toBeNull());
});

const ai = (o: Record<string, unknown>) => aiExtractionSchema.parse({ category: "cafe", confidenceScore: 0.9, missingFields: [], ...o });
const base: DecideInput = {
  originalUrl: "https://x.com/a", resolvedUrl: "https://x.com/a", platform: "website", evidenceText: "title: Cafe A\nราคา 120 บาท",
  evidence: [], ai: null, aiProvider: "gemini", isMock: false, candidates: [], placesChecked: true, now: new Date("2026-11-09T00:00:00Z"),
};
const cand = (id: string, name: string) => ({ googlePlaceId: id, name, lat: 13.7, lng: 100.5 });

describe("decide", () => {
  it("never invents a location: no evidence pin and no Places → needs_review", () => {
    const r = decide({ ...base, ai: ai({ placeName: "Cafe A" }) });
    expect(r.extractionStatus).toBe("needs_review");
    expect(r.latitude).toBeUndefined();
    expect(r.missingFields).toContain("location");
  });
  it("single confident Places match → completed with verified coords", () => {
    const r = decide({ ...base, ai: ai({ placeName: "Cafe A" }), candidates: [cand("G1", "Cafe A")] });
    expect(r).toMatchObject({ extractionStatus: "completed", googlePlaceId: "G1", latitude: 13.7 });
  });
  it("ambiguous Places results → user must choose", () => {
    const r = decide({ ...base, ai: ai({ placeName: "Cafe A" }), candidates: [cand("G1", "Cafe A Nimman"), cand("G2", "Cafe A Old Town")] });
    expect(r.extractionStatus).toBe("needs_review");
    expect(r.latitude).toBeUndefined();
    expect(pickCandidate("Cafe A Old Town", [cand("G1", "Cafe A Nimman"), cand("G2", "Cafe A Old Town")])?.googlePlaceId).toBe("G2");
  });
  it("precise Google Maps pin is trusted", () => {
    const r = decide({ ...base, ai: ai({ placeName: undefined, confidenceScore: 0.2 }), maps: { name: "Doi Suthep", lat: 18.8, lng: 98.9, precise: true } });
    expect(r).toMatchObject({ extractionStatus: "completed", placeName: "Doi Suthep", latitude: 18.8 });
  });
  it("mock provider can never auto-complete", () => {
    const r = decide({ ...base, ai: ai({ placeName: "Cafe A" }), isMock: true, candidates: [cand("G1", "Cafe A")] });
    expect(r.extractionStatus).toBe("needs_review");
    expect(r.isMock).toBe(true);
    expect(r.confidenceScore).toBeLessThanOrEqual(0.3);
  });
  it("low AI confidence goes to review", () => {
    const r = decide({ ...base, ai: ai({ placeName: "Cafe A", confidenceScore: 0.2 }), candidates: [cand("G1", "Cafe A"), cand("G2", "Cafe A")] });
    expect(r.extractionStatus).toBe("needs_review");
  });
  it("prices need a literal quote from the evidence", () => {
    expect(verifiedPrice(ai({ estimatedPrice: 120, priceEvidenceQuote: "ราคา 120 บาท" }), base.evidenceText)?.amount).toBe(120);
    expect(verifiedPrice(ai({ estimatedPrice: 150, priceEvidenceQuote: "ราคา 120 บาท" }), base.evidenceText)).toBeNull();
    expect(verifiedPrice(ai({ estimatedPrice: 120, priceEvidenceQuote: "ราคา 120 บาท ต่อคน" }), base.evidenceText)).toBeNull();
    expect(verifiedPrice(ai({ estimatedPrice: 120 }), base.evidenceText)).toBeNull();
    const r = decide({ ...base, ai: ai({ placeName: "Cafe A", estimatedPrice: 999, priceEvidenceQuote: "999" }) });
    expect(r.estimatedPrice).toBeUndefined();
    expect(r.missingFields).toContain("price");
  });
  it("AI schema coerces unknown categories to other and ignores coordinates", () => {
    const parsed = aiExtractionSchema.parse({ category: "spaceport", confidenceScore: 0.5, missingFields: [], latitude: 1, longitude: 2 });
    expect(parsed.category).toBe("other");
    expect("latitude" in parsed).toBe(false);
  });
});
