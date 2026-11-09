import { describe, expect, it } from "vitest";
import { inviteUrl, normalizeInviteInput } from "@/lib/invite";
import { safeNextPath } from "@/lib/safe-redirect";

describe("normalizeInviteInput", () => {
  it("normalises codes", () => {
    expect(normalizeInviteInput("ab12cd34")).toBe("AB12CD34");
    expect(normalizeInviteInput(" AB12-CD34 ")).toBe("AB12CD34");
  });
  it("extracts from invite links", () => {
    expect(normalizeInviteInput("https://tripsync.app/join/ab12cd34")).toBe("AB12CD34");
    expect(normalizeInviteInput("https://evil.test/other/ab12cd34")).toBeNull();
  });
  it("accepts 36-hex tokens", () => {
    const tok = "a".repeat(36);
    expect(normalizeInviteInput(tok.toUpperCase())).toBe(tok);
  });
  it("rejects junk / injection", () => {
    for (const bad of ["", "abc", "ZZZZZZZZ", "'; drop table trips;--", "AB12CD34X"]) expect(normalizeInviteInput(bad)).toBeNull();
  });
  it("builds links", () => {
    expect(inviteUrl("https://x.app/", "AB12CD34")).toBe("https://x.app/join/AB12CD34");
  });
});

describe("safeNextPath (open-redirect guard)", () => {
  it("allows relative paths", () => {
    expect(safeNextPath("/trips/1?x=1")).toBe("/trips/1?x=1");
    expect(safeNextPath("/join/AB12CD34")).toBe("/join/AB12CD34");
  });
  it("blocks external / protocol-relative / tricks", () => {
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "/\nLocation: x", null, ""]) {
      expect(safeNextPath(bad)).toBe("/trips");
    }
  });
});
