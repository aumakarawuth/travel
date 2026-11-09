import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "./fake-supabase";

/**
 * Submission → Extraction → Review → Place (map-ready) flow with external services mocked.
 * Planner integration is added in Phase 4.
 */
const metaMock = vi.fn();
vi.mock("@/lib/metadata/fetch-metadata", () => ({ fetchLinkMetadata: (...a: unknown[]) => metaMock(...a) }));
const placesMock = vi.fn();
vi.mock("@/lib/places/google-places", () => ({ placesAvailable: () => true, searchPlaces: (...a: unknown[]) => placesMock(...a) }));

import { processSubmission } from "@/lib/pipeline/process";
import { savePlaceForSubmission } from "@/lib/pipeline/save-place";

const TRIP = "trip-1", ALICE = "alice", BOB = "bob";
const sub = (id: string, by: string, url: string) => ({ id, trip_id: TRIP, submitted_by: by, original_url: url, user_note: null, status: "pending", metadata: {} });
const tiktokMeta = (title: string) => ({
  resolvedUrl: "https://www.tiktok.com/@x/video/1", platform: "tiktok", oembed: { title, provider: "TikTok" },
  evidence: [{ sourceType: "oembed", url: "https://www.tiktok.com/oembed", fields: { title } }], blockedByPlatform: false,
});

beforeEach(() => { metaMock.mockReset(); placesMock.mockReset(); delete process.env.GEMINI_API_KEY; delete process.env.ANTHROPIC_API_KEY; process.env.AI_PROVIDER = "mock"; });

describe("link submission pipeline", () => {
  it("mock AI → needs review (never auto-pinned), job + submission recorded", async () => {
    const { client, db } = createFakeSupabase({ link_submissions: [sub("s1", ALICE, "https://vt.tiktok.com/a")] });
    metaMock.mockResolvedValue(tiktokMeta("name: คาเฟ่ลับ เชียงใหม่ ☕ #cafe"));
    placesMock.mockResolvedValue([{ googlePlaceId: "G1", name: "คาเฟ่ลับ", lat: 18.79, lng: 98.98, types: [] }]);
    await processSubmission(client, ALICE, "s1");
    const s = db.link_submissions[0];
    expect(s.status).toBe("needs_review");
    expect(s.metadata.extraction.isMock).toBe(true);
    expect(s.metadata.extraction.category).toBe("cafe");
    expect(s.metadata.candidates).toHaveLength(1);
    expect(db.places ?? []).toHaveLength(0);
    expect(db.ai_extraction_jobs[0]).toMatchObject({ status: "succeeded", provider: "mock", idempotency_key: "s1:0" });
  });

  it("is idempotent: re-running the same attempt does nothing", async () => {
    const { client, db } = createFakeSupabase({ link_submissions: [sub("s1", ALICE, "https://x.com")] });
    metaMock.mockResolvedValue(tiktokMeta("x"));
    placesMock.mockResolvedValue([]);
    await processSubmission(client, ALICE, "s1", 0);
    await processSubmission(client, ALICE, "s1", 0);
    expect(metaMock).toHaveBeenCalledTimes(1);
    expect(db.ai_extraction_jobs).toHaveLength(1);
  });

  it("precise Google Maps link → completed, place created and pinned", async () => {
    const { client, db } = createFakeSupabase({ link_submissions: [sub("s2", BOB, "https://maps.app.goo.gl/x")] });
    metaMock.mockResolvedValue({
      resolvedUrl: "https://www.google.com/maps/place/Doi+Suthep/data=!3d18.8048!4d98.9216", platform: "google_maps",
      maps: { name: "Doi Suthep", lat: 18.8048, lng: 98.9216, precise: true }, evidence: [], blockedByPlatform: false,
      page: { title: "Doi Suthep · Google Maps", jsonLdNames: [] },
    });
    placesMock.mockResolvedValue([]);
    await processSubmission(client, BOB, "s2");
    expect(db.link_submissions[0].status).toBe("completed");
    expect(db.places).toHaveLength(1);
    expect(db.places[0]).toMatchObject({ name: "Doi Suthep", lat: 18.8048, location_verified: true });
    expect(db.place_submissions).toHaveLength(1);
    expect(db.trip_place_selections[0]).toMatchObject({ status: "proposed" });
  });

  it("fetch failure / blocked platform → needs review for manual entry, not a fabricated place", async () => {
    const { client, db } = createFakeSupabase({ link_submissions: [sub("s3", ALICE, "https://instagram.com/p/1")] });
    metaMock.mockResolvedValue({ resolvedUrl: "https://instagram.com/p/1", platform: "instagram", evidence: [], blockedByPlatform: true, fetchError: "http_error" });
    await processSubmission(client, ALICE, "s3");
    expect(db.link_submissions[0].status).toBe("needs_review");
    expect(db.link_submissions[0].metadata.blockedByPlatform).toBe(true);
    expect(db.places ?? []).toHaveLength(0);
  });

  it("review → two members' submissions of the same place merge into one place with both submitters", async () => {
    const { client, db } = createFakeSupabase({ link_submissions: [sub("a", ALICE, "https://tiktok.com/1"), sub("b", BOB, "https://instagram.com/2")] });
    const input = { name: "Wat Arun", category: "attraction" as const, lat: 13.7437, lng: 100.4888, googlePlaceId: "G-ARUN", locationVerified: true, images: [], confidence: 1, evidence: [] };
    const r1 = await savePlaceForSubmission(client, ALICE, TRIP, "a", input);
    const r2 = await savePlaceForSubmission(client, BOB, TRIP, "b", { ...input, name: "วัดอรุณ (Wat Arun)", googlePlaceId: "G-ARUN" });
    expect(r1.merged).toBe(false);
    expect(r2).toEqual({ placeId: r1.placeId, merged: true });
    expect(db.places).toHaveLength(1);
    expect(db.place_submissions.map((p) => p.submitted_by).sort()).toEqual([ALICE, BOB]);
  });

  it("SSRF-blocked URL → failed, nothing fetched further", async () => {
    const { SafeFetchError } = await import("@/lib/url/safe-fetch");
    const { client, db } = createFakeSupabase({ link_submissions: [sub("s4", ALICE, "https://rebind.test")] });
    metaMock.mockRejectedValue(new SafeFetchError("blocked_ip"));
    await processSubmission(client, ALICE, "s4");
    expect(db.link_submissions[0]).toMatchObject({ status: "failed", error_message: "blocked_unsafe_url" });
    expect(db.ai_extraction_jobs[0].status).toBe("failed");
  });
});

describe("… → Map → Planner", () => {
  it("confirmed places flow into a feasible plan with Google Maps route links", async () => {
    const { buildDays, buildPlaces } = await import("@/lib/planner/build-input");
    const { optimizePlan } = await import("@/lib/planner/optimize");
    const { makeTravelFn } = await import("@/lib/planner/travel");
    const { directionsSegments } = await import("@/lib/planner/links");
    const { splitPinnable } = await import("@/lib/explore");
    const { DEFAULT_SETTINGS } = await import("@/lib/planner/types");

    const { client, db } = createFakeSupabase({ link_submissions: [sub("a", ALICE, "u1"), sub("b", BOB, "u2"), sub("c", ALICE, "u3")] });
    const mk = (n: string, lat: number) => ({ name: n, category: "attraction" as const, lat, lng: 98.98, locationVerified: true, images: [], confidence: 1, evidence: [] });
    await savePlaceForSubmission(client, ALICE, TRIP, "a", mk("Wat Phra Singh", 18.788));
    await savePlaceForSubmission(client, BOB, TRIP, "b", mk("Doi Suthep", 18.805));
    await savePlaceForSubmission(client, ALICE, TRIP, "c", { ...mk("Secret cafe", 0), lat: undefined, locationVerified: false });

    // map step: unverified place is not pinned
    const pins = splitPinnable(db.places.map((p: Record<string, unknown>) => ({ ...p, locationVerified: p.location_verified, votes: [], submitters: [], sourceUrls: [] })) as never);
    expect(pins.pinned).toHaveLength(2);

    // selection step: owner selects all three
    const rows = db.places.map((p: Record<string, unknown>) => ({ ...p, selection: { status: "selected", priority: "normal", fixed_start_at: null, preferred_day: null } }));
    const { places, noLocation } = buildPlaces(rows as never, []);
    const { days } = buildDays({ start_date: "2026-12-01", end_date: "2026-12-01", daily_start_time: "09:00", daily_end_time: "18:00" }, [], new Set());
    const plan = optimizePlan(places, days, makeTravelFn("car"), DEFAULT_SETTINGS, "estimate");

    expect(plan.days[0].feasible).toBe(true);
    expect(plan.days[0].stops.filter((s) => s.kind === "place")).toHaveLength(2);
    expect(noLocation.map((n) => n.name)).toEqual(["Secret cafe"]);
    expect(plan.routingSource).toBe("estimate");
    const urls = directionsSegments(plan.days[0].stops.flatMap((s) => (s.kind === "place" ? [{ ...places.find((p) => p.id === s.placeId)!, placeId: null }] : [])), "car");
    expect(urls[0]).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&origin=18\./);
  });
});
