import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import manifest from "@/app/manifest";
import { extractUrl, checkUrl } from "@/lib/url/normalize";

describe("web app manifest", () => {
  const m = manifest() as ReturnType<typeof manifest> & { share_target: { action: string; method: string; params: Record<string, string> } };
  it("is installable (standalone, start_url, 192/512 + maskable icons that exist)", () => {
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/trips");
    const sizes = m.icons!.map((i) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(m.icons!.some((i) => i.purpose === "maskable")).toBe(true);
    for (const i of m.icons!) expect(existsSync(`public${i.src}`)).toBe(true);
  });
  it("declares a GET share target with url/text/title", () => {
    expect(m.share_target).toEqual({ action: "/share", method: "GET", params: { title: "title", text: "text", url: "url" } });
  });
});

describe("share target input", () => {
  it("finds links that Android puts in `text`", () => {
    const text = "ร้านนี้ดีมาก ไปกัน! https://vt.tiktok.com/ZSabc123/ #cafe";
    expect(extractUrl(text)).toBe("https://vt.tiktok.com/ZSabc123/");
    expect(checkUrl(extractUrl(text)!).ok).toBe(true);
    expect(extractUrl("no link here")).toBeNull();
  });
});

describe("service worker policy", () => {
  const sw = readFileSync("public/sw.js", "utf8");
  it("never caches non-GET, cross-origin, API, RSC or server-action requests", () => {
    expect(sw).toContain('req.method !== "GET"');
    expect(sw).toContain("url.origin !== self.location.origin");
    expect(sw).toMatch(/\/api\//);
    expect(sw).toContain('req.headers.get("RSC")');
    expect(sw).toContain('req.headers.get("Next-Action")');
  });
  it("falls back to a self-contained offline page that is precached", () => {
    expect(sw).toContain('"/offline.html"');
    const html = readFileSync("public/offline.html", "utf8");
    expect(html).not.toMatch(/<script/i);
  });
});
