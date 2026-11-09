import { describe, expect, it } from "vitest";
import { canChangeRole, canDeleteTrip, canEditTrip, canLeaveTrip, canRemoveMember, canSelectPlaces } from "@/lib/permissions";

const A = "a", B = "b";

describe("permissions (mirror of SQL RPC rules)", () => {
  it("edit/delete", () => {
    expect(canEditTrip("owner")).toBe(true);
    expect(canEditTrip("editor")).toBe(true);
    expect(canEditTrip("member")).toBe(false);
    expect(canEditTrip(null)).toBe(false);
    expect(canDeleteTrip("owner")).toBe(true);
    expect(canDeleteTrip("editor")).toBe(false);
    expect(canSelectPlaces("member")).toBe(false);
  });
  it("role changes: owner only, never self", () => {
    expect(canChangeRole("owner", A, B)).toBe(true);
    expect(canChangeRole("owner", A, A)).toBe(false);
    expect(canChangeRole("editor", A, B)).toBe(false);
    expect(canChangeRole("member", A, B)).toBe(false);
  });
  it("removal matrix", () => {
    expect(canRemoveMember("owner", "editor", A, B)).toBe(true);
    expect(canRemoveMember("owner", "member", A, B)).toBe(true);
    expect(canRemoveMember("editor", "member", A, B)).toBe(true);
    expect(canRemoveMember("editor", "editor", A, B)).toBe(false);
    expect(canRemoveMember("editor", "owner", A, B)).toBe(false);
    expect(canRemoveMember("member", "member", A, B)).toBe(false);
    expect(canRemoveMember("owner", "owner", A, A)).toBe(false);
    expect(canRemoveMember(undefined, "member", A, B)).toBe(false);
  });
  it("leave: everyone except owner", () => {
    expect(canLeaveTrip("owner")).toBe(false);
    expect(canLeaveTrip("editor")).toBe(true);
    expect(canLeaveTrip("member")).toBe(true);
  });
});
