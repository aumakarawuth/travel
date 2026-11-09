import { describe, expect, it } from "vitest";
import { directionsUrl, EMPTY_FILTERS, filterPlaces, interestScore, memberSummary, placeMapsUrl, rankPlaces, splitPinnable, tally, type ExplorePlace } from "@/lib/explore";

const A = { id: "a", name: "Alice", color: "#f00", avatar: null };
const B = { id: "b", name: "Bob", color: "#0f0", avatar: null };
const mk = (o: Partial<ExplorePlace>): ExplorePlace => ({
  id: o.name ?? "x", name: "X", category: "cafe", description: null, address: null, lat: 13.7, lng: 100.5, locationVerified: true,
  googlePlaceId: null, price: null, currency: null, image: null, status: "proposed", priority: "normal", note: null,
  submitters: [A], sourceUrls: [], votes: [], commentCount: 0, ...o,
});
const places = [
  mk({ name: "Cafe A", category: "cafe", price: 100, submitters: [A] }),
  mk({ name: "Temple", category: "attraction", price: null, status: "selected", submitters: [B] }),
  mk({ name: "Hotel", category: "accommodation", price: 2500, status: "rejected", submitters: [A, B] }),
  mk({ name: "Mystery", category: "other", lat: null, lng: null, locationVerified: false, status: "scheduled" }),
  mk({ name: "Unverified", lat: 1, lng: 1, locationVerified: false }),
];
const names = (ps: ExplorePlace[]) => ps.map((p) => p.name);

describe("filterPlaces", () => {
  it("no filters returns everything", () => expect(filterPlaces(places, EMPTY_FILTERS)).toHaveLength(5));
  it("category", () => expect(names(filterPlaces(places, { ...EMPTY_FILTERS, categories: ["attraction", "accommodation"] }))).toEqual(["Temple", "Hotel"]));
  it("member", () => expect(names(filterPlaces(places, { ...EMPTY_FILTERS, memberId: "b" }))).toEqual(["Temple", "Hotel"]));
  it("status", () => expect(names(filterPlaces(places, { ...EMPTY_FILTERS, statuses: ["rejected"] }))).toEqual(["Hotel"]));
  it("budget keeps unknown prices", () => expect(names(filterPlaces(places, { ...EMPTY_FILTERS, maxPrice: 500 }))).not.toContain("Hotel"));
  it("selected / unselected", () => {
    expect(names(filterPlaces(places, { ...EMPTY_FILTERS, selection: "selected" }))).toEqual(["Temple", "Mystery"]);
    expect(names(filterPlaces(places, { ...EMPTY_FILTERS, selection: "unselected" }))).toEqual(["Cafe A", "Hotel", "Unverified"]);
  });
  it("text search", () => expect(names(filterPlaces(places, { ...EMPTY_FILTERS, query: "temp" }))).toEqual(["Temple"]));
});

describe("splitPinnable", () => {
  it("never pins places without verified coordinates", () => {
    const { pinned, unpinned } = splitPinnable(places);
    expect(names(unpinned)).toEqual(["Mystery", "Unverified"]);
    expect(pinned).toHaveLength(3);
  });
});

describe("votes & ranking", () => {
  const v = mk({ name: "V", votes: [{ userId: "a", vote: "want" }, { userId: "b", vote: "maybe" }, { userId: "c", vote: "not_interested" }] });
  it("tallies", () => expect(tally(v.votes)).toEqual({ want: 1, maybe: 1, not_interested: 1 }));
  it("scores and ranks with must-visit first", () => {
    expect(interestScore(v)).toBe(2);
    const ranked = rankPlaces([v, mk({ name: "M", priority: "must_visit" }), mk({ name: "Z" })]);
    expect(names(ranked)).toEqual(["M", "V", "Z"]);
  });
});

describe("memberSummary", () => {
  it("counts submissions, places and want votes per member", () => {
    const withVotes = places.map((p, i) => (i === 0 ? { ...p, votes: [{ userId: "b", vote: "want" as const }] } : p));
    const s = memberSummary([A, B], withVotes, { a: 4, b: 2 });
    expect(s[0]).toMatchObject({ member: A, submissions: 4, places: 4 });
    expect(s[1]).toMatchObject({ member: B, submissions: 2, places: 2, wantVotes: 1 });
  });
});

describe("Google Maps URLs", () => {
  it("uses official api=1 format with place id", () => {
    expect(placeMapsUrl({ lat: 13.7, lng: 100.5, googlePlaceId: "ChIJx", name: "n" })).toBe("https://www.google.com/maps/search/?api=1&query=13.7,100.5&query_place_id=ChIJx");
    expect(directionsUrl({ lat: 13.7, lng: 100.5, googlePlaceId: null })).toBe("https://www.google.com/maps/dir/?api=1&destination=13.7,100.5");
    expect(directionsUrl({ lat: null, lng: null, googlePlaceId: null })).toBeNull();
    expect(placeMapsUrl({ lat: null, lng: null, googlePlaceId: null, name: "Wat Arun" })).toContain("query=Wat%20Arun");
  });
});
