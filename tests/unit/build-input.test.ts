import { describe, expect, it } from "vitest";
import { buildDays, buildPlaces, hotelForNight, localIso, toLocal, tripDates, DEFAULT_VISIT, type HotelRow, type PlaceRow } from "@/lib/planner/build-input";

const trip = { start_date: "2026-12-01", end_date: "2026-12-03", daily_start_time: "09:00:00", daily_end_time: "19:30:00" };
const H = (id: string, inD: string, outD: string, status: HotelRow["status"] = "confirmed", lat: number | null = 18.8): HotelRow =>
  ({ id, name: id, lat, lng: lat === null ? null : 98.9, check_in_date: inD, check_out_date: outD, status });

describe("dates & timezone", () => {
  it("lists trip dates inclusively", () => expect(tripDates("2026-12-30", "2027-01-01")).toEqual(["2026-12-30", "2026-12-31", "2027-01-01"]));
  it("converts to/from Bangkok local time", () => {
    expect(toLocal("2026-12-01T03:30:00Z")).toEqual({ date: "2026-12-01", minute: 630 });
    expect(toLocal("2026-12-01T20:00:00Z")).toEqual({ date: "2026-12-02", minute: 180 });
    expect(localIso("2026-12-01", 630)).toBe("2026-12-01T10:30:00+07:00");
    expect(localIso("2026-12-01", 1500)).toBe("2026-12-02T01:00:00+07:00");
  });
});

describe("hotels → day start/end", () => {
  it("night N hotel ends day N and starts day N+1; confirmed preferred", () => {
    const hotels = [H("A", "2026-12-01", "2026-12-02", "proposed"), H("B", "2026-12-01", "2026-12-03"), H("C", "2026-12-03", "2026-12-04", "confirmed", null)];
    expect(hotelForNight(hotels, "2026-12-01")?.id).toBe("B");
    const { days, warnings } = buildDays(trip, hotels, new Set(["2026-12-02"]));
    expect(days.map((d) => [d.startPoint?.name ?? null, d.endPoint?.name ?? null])).toEqual([[null, "B"], ["B", "B"], ["B", null]]); // C has no coords
    expect(days[0]).toMatchObject({ start: 540, end: 1170, weekday: 2 });
    expect(days[1].locked).toBe(true);
    expect(warnings).toEqual([]);
  });
  it("warns when only a proposed hotel exists", () => {
    expect(buildDays(trip, [H("P", "2026-12-01", "2026-12-02", "proposed")], new Set()).warnings).toEqual(["hotel_unconfirmed:2026-12-01"]);
  });
});

describe("places → planner places", () => {
  const row = (o: Partial<PlaceRow>): PlaceRow => ({
    id: "x", name: "x", category: "cafe", lat: 18.8, lng: 98.9, location_verified: true, visit_duration_minutes: null, estimated_price: null,
    opening_hours: null, selection: { status: "selected", priority: "normal", fixed_start_at: null, preferred_day: null }, ...o,
  });
  it("uses only selected/scheduled, excludes hotels, reports missing location", () => {
    const { places, noLocation } = buildPlaces([
      row({ id: "a" }), row({ id: "b", selection: { status: "proposed", priority: "normal", fixed_start_at: null, preferred_day: null } }),
      row({ id: "h", category: "accommodation" }), row({ id: "n", location_verified: false }), row({ id: "s", selection: { status: "scheduled", priority: "high", fixed_start_at: "2026-12-02T03:00:00Z", preferred_day: null } }),
    ], [{ placeId: "a", date: "2026-12-01", position: 2 }]);
    expect(places.map((p) => p.id)).toEqual(["a", "s"]);
    expect(noLocation.map((p) => p.placeId)).toEqual(["n"]);
    expect(places[0]).toMatchObject({ visitMinutes: DEFAULT_VISIT.cafe, visitMinutesIsDefault: true, lock: { date: "2026-12-01", position: 2 }, openingPeriods: null });
    expect(places[1].fixedStart).toEqual({ date: "2026-12-02", minute: 600 });
  });
});
