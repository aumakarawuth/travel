import { describe, expect, it, vi } from "vitest";

// Pretend a public-looking hostname resolves to an internal address (DNS rebinding / SSRF).
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async (host: string) =>
    host === "rebind.example.com" ? [{ address: "10.0.0.5", family: 4 }]
    : host === "mixed.example.com" ? [{ address: "93.184.216.34", family: 4 }, { address: "127.0.0.1", family: 4 }]
    : [{ address: "169.254.169.254", family: 4 }]),
}));

import { safeFetch, SafeFetchError } from "@/lib/url/safe-fetch";

describe("safeFetch SSRF guard", () => {
  it("refuses hostnames that resolve to private IPs (checked at connect time)", async () => {
    await expect(safeFetch("https://rebind.example.com/")).rejects.toMatchObject({ code: "blocked_ip" });
  });
  it("refuses if ANY resolved address is private", async () => {
    await expect(safeFetch("https://mixed.example.com/")).rejects.toBeInstanceOf(SafeFetchError);
  });
  it("refuses literal internal URLs before any network I/O", async () => {
    await expect(safeFetch("http://169.254.169.254/latest/meta-data")).rejects.toMatchObject({ code: "blocked_url" });
    await expect(safeFetch("http://localhost:3000/")).rejects.toMatchObject({ code: "blocked_url" });
  });
});
