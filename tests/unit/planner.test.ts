import { describe, expect, it } from "vitest";
import { estimateLeg, makeTravelFn, buffered } from "@/lib/planner/travel";
import { fitVisit, openWindows } from "@/lib/planner/hours";
import { nearestNeighbour, routeCost, twoOpt } from "@/lib/planner/order";
import { assignDays } from "@/lib/planner/cluster";
import { simulateDay } from "@/lib/planner/simulate";
import { optimizePlan, resimulate } from "@/lib/planner/optimize";
import { directionsSegments, durationText, hhmm, thaiDaySummary } from "@/lib/planner/links";
import { DEFAULT_SETTINGS, type PlannerDay, type PlannerPlace } from "@/lib/planner/types";

const travel = makeTravelFn("car");
const S = DEFAULT_SETTINGS;
const P = (id: string, lat: number, lng: number, o: Partial<PlannerPlace> = {}): PlannerPlace => ({
  id, name: id, lat, lng, category: "attraction", priority: "normal", visitMinutes: 60, visitMinutesIsDefault: false, cost: null,
  openingPeriods: null, fixedStart: null, preferredDate: null, lock: null, ...o,
});
const D = (date: string, weekday: number, o: Partial<PlannerDay> = {}): PlannerDay => ({ date, weekday, start: 540, end: 1080, startPoint: null, endPoint: null, locked: false, ...o });
// Chiang Mai (north cluster) vs Bangkok (south cluster), ~580 km apart
const CNX = [P("cnx1", 18.79, 98.98), P("cnx2", 18.80, 98.97), P("cnx3", 18.78, 98.99)];
const BKK = [P("bkk1", 13.75, 100.50), P("bkk2", 13.74, 100.49), P("bkk3", 13.76, 100.51)];

describe("travel estimates", () => {
  it("are flagged as estimates and scale with distance", () => {
    const a = estimateLeg({ lat: 13.75, lng: 100.5 }, { lat: 13.85, lng: 100.5 }, "car");
    expect(a.estimate).toBe(true);
    expect(a.meters).toBeGreaterThan(11_000 * 1.3);
    expect(a.minutes).toBeGreaterThan(20);
    expect(estimateLeg({ lat: 1, lng: 1 }, { lat: 1, lng: 1 }, "car").minutes).toBe(0);
  });
  it("prefers matrix values and adds buffers", () => {
    const m = new Map([["13.000000,100.000000>13.100000,100.000000", { minutes: 20, meters: 15000, estimate: false }]]);
    const t = makeTravelFn("car", m);
    expect(t({ lat: 13, lng: 100 }, { lat: 13.1, lng: 100 })).toEqual({ minutes: 20, meters: 15000, estimate: false });
    expect(t({ lat: 13.1, lng: 100 }, { lat: 13, lng: 100 }).estimate).toBe(true);
    expect(buffered({ minutes: 20, meters: 1, estimate: false }, 15, 10).minutes).toBe(33);
  });
});

describe("opening hours", () => {
  const periods = [{ open: { day: 1, hour: 10, minute: 0 }, close: { day: 1, hour: 16, minute: 0 } }, { open: { day: 5, hour: 18, minute: 0 }, close: { day: 6, hour: 2, minute: 0 } }];
  it("windows per weekday incl. overnight", () => {
    expect(openWindows(periods, 1)).toEqual([[600, 960]]);
    expect(openWindows(periods, 0)).toEqual([]);
    expect(openWindows(periods, 6)).toEqual([[0, 120]]);
    expect(openWindows(null, 1)).toBeNull();
  });
  it("fits visits, waits for opening, rejects if closed", () => {
    expect(fitVisit([[600, 960]], 540, 60)).toBe(600);
    expect(fitVisit([[600, 960]], 930, 60)).toBeNull();
    expect(fitVisit(null, 540, 60)).toBe(540);
  });
});

describe("ordering", () => {
  it("2-opt never makes a route worse than nearest neighbour", () => {
    const pts = [P("a", 13.70, 100.50), P("b", 13.80, 100.60), P("c", 13.70, 100.60), P("d", 13.80, 100.50), P("e", 13.75, 100.55)];
    const start = { lat: 13.69, lng: 100.49 };
    const nn = nearestNeighbour(pts, start, travel);
    const opt = twoOpt(nn, start, start, travel);
    expect(routeCost(opt, start, start, travel)).toBeLessThanOrEqual(routeCost(nn, start, start, travel));
    expect(new Set(opt.map((p) => p.id))).toEqual(new Set(pts.map((p) => p.id)));
  });
});

describe("assignDays (geographic clustering)", () => {
  it("keeps far-apart cities on separate days", () => {
    const res = assignDays([...BKK, ...CNX], [D("2026-12-01", 2), D("2026-12-02", 3)]);
    const groups = [...res.values()].map((ps) => new Set(ps.map((p) => p.id.slice(0, 3))));
    expect(groups.every((g) => g.size === 1)).toBe(true);
  });
  it("anchors days to that night's hotel", () => {
    const days = [D("2026-12-01", 2, { endPoint: { lat: 18.79, lng: 98.98, name: "CNX hotel", kind: "hotel" } }), D("2026-12-02", 3, { endPoint: { lat: 13.75, lng: 100.5, name: "BKK hotel", kind: "hotel" } })];
    const res = assignDays([...BKK, ...CNX], days);
    expect(res.get("2026-12-01")!.every((p) => p.id.startsWith("cnx"))).toBe(true);
  });
  it("honours locks and preferred dates", () => {
    const res = assignDays([P("x", 13.75, 100.5, { lock: { date: "2026-12-02", position: 0 } }), P("y", 13.75, 100.5, { preferredDate: "2026-12-02" })], [D("2026-12-01", 2), D("2026-12-02", 3)]);
    expect(res.get("2026-12-02")!.map((p) => p.id).sort()).toEqual(["x", "y"]);
  });
});

describe("simulateDay", () => {
  it("builds a timeline with lunch, waits for opening, ends at hotel", () => {
    const day = D("2026-12-07", 1, { startPoint: { lat: 13.75, lng: 100.5, name: "H", kind: "hotel" }, endPoint: { lat: 13.75, lng: 100.5, name: "H", kind: "hotel" } });
    const museum = P("museum", 13.76, 100.5, { visitMinutes: 120, openingPeriods: [{ open: { day: 1, hour: 10, minute: 0 }, close: { day: 1, hour: 17, minute: 0 } }] });
    const park = P("park", 13.77, 100.51, { visitMinutes: 90 });
    const r = simulateDay(day, [museum, park], travel, S);
    const placeStops = r.plan.stops.filter((s) => s.kind === "place");
    expect(placeStops[0]).toMatchObject({ placeId: "museum" });
    expect((placeStops[0] as { wait: number }).wait).toBeGreaterThan(0); // arrives before 10:00
    expect(r.plan.stops.some((s) => s.kind === "meal" && s.label === "lunch")).toBe(true);
    expect(r.plan.stops.at(-1)!.kind).toBe("hotel");
    expect(r.plan.feasible).toBe(true);
    expect((placeStops[1] as { notes: string[] }).notes).toContain("hours_unknown");
  });
  it("detects closed places and late fixed-time bookings", () => {
    const closed = P("closed", 13.76, 100.5, { openingPeriods: [] });
    const fixed = P("show", 13.76, 100.5, { fixedStart: { date: "2026-12-07", minute: 540 } });
    const r = simulateDay(D("2026-12-07", 1), [P("first", 13.9, 100.6, { visitMinutes: 120 }), closed, fixed], travel, S);
    expect(r.closed.map((p) => p.id)).toEqual(["closed"]);
    expect(r.fixedConflicts.map((p) => p.id)).toEqual(["show"]);
    expect(r.plan.feasible).toBe(false);
  });
});

describe("optimizePlan", () => {
  it("drops lowest priority first with a reason, keeps must-visit", () => {
    const many = Array.from({ length: 9 }, (_, i) => P(`p${i}`, 13.75 + i * 0.01, 100.5, { visitMinutes: 90, priority: i === 0 ? "must_visit" : i < 3 ? "optional" : "normal" }));
    const r = optimizePlan(many, [D("2026-12-01", 2)], travel, S, "estimate");
    const scheduled = r.days[0].stops.filter((s) => s.kind === "place").map((s) => (s as { placeId: string }).placeId);
    expect(r.days[0].feasible).toBe(true);
    expect(scheduled).toContain("p0");
    expect(r.unscheduled.length).toBeGreaterThan(0);
    expect(r.unscheduled.every((u) => u.reason === "not_enough_time")).toBe(true);
    expect(r.unscheduled.map((u) => u.placeId)).toEqual(expect.arrayContaining(["p1", "p2"]));
    expect(scheduled.length + r.unscheduled.length).toBe(9);
  });
  it("moves a place closed on day 1 to an open day", () => {
    const monOnly = P("mon", 13.75, 100.5, { openingPeriods: [{ open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 18, minute: 0 } }] });
    const r = optimizePlan([monOnly], [D("2026-12-06", 0), D("2026-12-07", 1)], travel, S, "estimate");
    expect(r.days[1].stops.some((s) => s.kind === "place" && s.placeId === "mon")).toBe(true);
    expect(r.unscheduled).toHaveLength(0);
  });
  it("reports never-open places as closed", () => {
    const r = optimizePlan([P("never", 13.75, 100.5, { openingPeriods: [] })], [D("2026-12-06", 0)], travel, S, "estimate");
    expect(r.unscheduled[0]).toMatchObject({ placeId: "never", reason: "closed" });
  });
  it("keeps locked order and flags estimate routing", () => {
    const a = P("a", 13.80, 100.5, { lock: { date: "2026-12-01", position: 0 } });
    const b = P("b", 13.70, 100.5, { lock: { date: "2026-12-01", position: 1 } });
    const r = optimizePlan([a, b, P("c", 13.75, 100.5)], [D("2026-12-01", 2)], travel, S, "estimate");
    const ids = r.days[0].stops.filter((s) => s.kind === "place").map((s) => (s as { placeId: string }).placeId);
    expect(ids.indexOf("a")).toBeLessThan(ids.indexOf("b"));
    expect(r.days[0].explanation).toContain("travel_estimate");
  });
  it("rain plan keeps indoor places only", () => {
    const r = optimizePlan([P("m", 13.75, 100.5, { category: "attraction" }), P("w", 13.76, 100.5, { category: "nature" })], [D("2026-12-01", 2)], travel, S, "estimate");
    expect(r.days[0].rainPlan).toEqual(["m"]);
  });
  it("places outside trip dates are reported", () => {
    const r = optimizePlan([P("late", 13.7, 100.5, { lock: { date: "2027-01-01", position: 0 } })], [D("2026-12-01", 2)], travel, S, "estimate");
    expect(r.unscheduled[0].reason).toBe("outside_trip_dates");
  });
  it("resimulate re-checks a manual order", () => {
    const r = resimulate([D("2026-12-01", 2, { end: 600 })], new Map([["2026-12-01", [P("a", 13.75, 100.5, { visitMinutes: 120 })]]]), travel, S, "estimate");
    expect(r.days[0].feasible).toBe(false);
    expect(r.days[0].warnings).toContain("over_time");
  });
});

describe("links & summary", () => {
  const pts = Array.from({ length: 7 }, (_, i) => ({ lat: 13 + i / 10, lng: 100, name: `p${i}`, placeId: i === 0 ? "ChIJ0" : null }));
  it("splits into continuous mobile-safe segments", () => {
    const urls = directionsSegments(pts, "car");
    expect(urls).toHaveLength(2);
    const q = urls.map((u) => new URL(u).searchParams);
    expect(q[0].get("api")).toBe("1");
    expect(q[0].get("waypoints")!.split("|")).toHaveLength(3);
    expect(q[0].get("origin_place_id")).toBe("ChIJ0");
    expect(q[0].get("destination")).toBe(q[1].get("origin")); // continuous
    expect(q[1].get("destination")).toBe("13.600000,100.000000");
    expect(q[0].get("travelmode")).toBe("driving");
    expect(directionsSegments(pts, "walking", 9)).toHaveLength(1);
    expect(directionsSegments(pts.slice(0, 1), "car")).toEqual([]);
  });
  it("formats Thai summary and durations", () => {
    expect(hhmm(545)).toBe("09:05");
    expect(durationText(95)).toBe("1 ชม. 35 นาที");
    const s = thaiDaySummary(0, {
      start: 540, finish: 1080, startPoint: { name: "ริมปิง", kind: "hotel" }, endPoint: { name: "ริมปิง", kind: "hotel" },
      stops: [{ kind: "place", name: "คาเฟ่ A", arrive: 560 }, { kind: "meal", label: "lunch" }, { kind: "place", name: "ร้านอาหาร B", arrive: 700 }, { kind: "hotel", name: "ริมปิง", arrive: 1080 }],
    });
    expect(s).toBe("วันที่ 1: ออกเดินทางจากโรงแรม ริมปิง 09:00 → คาเฟ่ A → ร้านอาหาร B → กลับโรงแรม ริมปิง 18:00");
    expect(thaiDaySummary(1, { start: 540, finish: 900, startPoint: null, endPoint: null, stops: [{ kind: "place", name: "A", arrive: 545 }, { kind: "place", name: "B", arrive: 700 }] }))
      .toBe("วันที่ 2: เริ่มที่A 09:05 → B → จบวัน 15:00");
  });
});
