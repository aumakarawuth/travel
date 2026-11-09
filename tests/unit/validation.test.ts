import { describe, expect, it } from "vitest";
import { dayCount, tripInputSchema } from "@/lib/validation/trip";

const base = { name: "เชียงใหม่", start_date: "2026-12-01", end_date: "2026-12-03" };

describe("tripInputSchema", () => {
  it("accepts minimal input and fills defaults", () => {
    const r = tripInputSchema.parse(base);
    expect(r).toMatchObject({ currency: "THB", travel_mode: "car", daily_start_time: "09:00", daily_end_time: "20:00", expected_member_count: 1 });
    expect(r.budget_total).toBeUndefined();
  });
  it("coerces form strings", () => {
    const r = tripInputSchema.parse({ ...base, budget_total: "15000", expected_member_count: "4", currency: "usd", daily_start_time: "08:30:00" });
    expect(r.budget_total).toBe(15000);
    expect(r.expected_member_count).toBe(4);
    expect(r.currency).toBe("USD");
    expect(r.daily_start_time).toBe("08:30");
  });
  it("treats empty optional strings as undefined", () => {
    const r = tripInputSchema.parse({ ...base, budget_total: "", description: "  ", start_location_name: "" });
    expect(r.budget_total).toBeUndefined();
    expect(r.description).toBeUndefined();
  });
  it("rejects end before start", () => {
    const r = tripInputSchema.safeParse({ ...base, end_date: "2026-11-30" });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0]).toMatchObject({ path: ["end_date"], message: "end_before_start" });
  });
  it("rejects trips longer than 61 days", () => {
    expect(tripInputSchema.safeParse({ ...base, end_date: "2027-02-15" }).success).toBe(false);
  });
  it("rejects bad times, names, enums, negatives", () => {
    expect(tripInputSchema.safeParse({ ...base, daily_start_time: "20:00", daily_end_time: "09:00" }).success).toBe(false);
    expect(tripInputSchema.safeParse({ ...base, name: "   " }).success).toBe(false);
    expect(tripInputSchema.safeParse({ ...base, travel_mode: "rocket" }).success).toBe(false);
    expect(tripInputSchema.safeParse({ ...base, budget_total: "-5" }).success).toBe(false);
    expect(tripInputSchema.safeParse({ ...base, start_date: "01/12/2026" }).success).toBe(false);
  });
  it("dayCount is inclusive", () => {
    expect(dayCount("2026-12-01", "2026-12-03")).toBe(3);
    expect(dayCount("2026-12-01", "2026-12-01")).toBe(1);
  });
});
