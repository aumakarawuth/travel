import { describe, expect, it } from "vitest";
import { checkUrl, detectPlatform, extractUrl, normalizeUrl } from "@/lib/url/normalize";
import { isBlockedIp } from "@/lib/url/ip";

describe("checkUrl", () => {
  it("accepts normal links and bare domains", () => {
    expect(checkUrl("https://www.tiktok.com/@a/video/1").ok).toBe(true);
    expect(checkUrl("maps.app.goo.gl/abc").ok).toBe(true);
  });
  it("extracts the URL from share-sheet text", () => {
    expect(extractUrl("ร้านนี้ดีมาก! https://vt.tiktok.com/ZS123/ ไปกัน")).toBe("https://vt.tiktok.com/ZS123/");
    expect(checkUrl("ดูนี่ https://maps.app.goo.gl/x).").ok).toBe(true);
  });
  it.each([
    ["javascript:alert(1)", "protocol"], ["file:///etc/passwd", "protocol"], ["ftp://x.com/a", "protocol"],
    ["http://user:pw@example.com", "credentials"], ["http://example.com:8080/", "port"],
    ["http://localhost/", "host"], ["http://127.0.0.1/", "host"], ["http://169.254.169.254/latest/meta-data", "host"],
    ["http://[::1]/", "host"], ["http://intranet/", "host"], ["http://db.internal/", "host"], ["", "empty"],
  ])("rejects %s", (u, reason) => {
    const r = checkUrl(u);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(reason);
  });
  it("rejects overly long URLs", () => {
    expect(checkUrl("https://a.com/" + "x".repeat(3000)).ok).toBe(false);
  });
});

describe("normalizeUrl (dedupe key)", () => {
  const n = (s: string) => normalizeUrl(new URL(s));
  it("drops tracking params, www/m., fragments and trailing slash", () => {
    expect(n("https://www.instagram.com/p/ABC/?igshid=xyz&utm_source=ig#c")).toBe("https://instagram.com/p/ABC");
    expect(n("http://m.facebook.com/page/?fbclid=1")).toBe("https://facebook.com/page");
  });
  it("keeps meaningful params, sorted", () => {
    expect(n("https://youtube.com/watch?v=abc&si=track&t=10")).toBe("https://youtube.com/watch?t=10&v=abc");
  });
});

describe("detectPlatform", () => {
  const d = (s: string) => detectPlatform(new URL(s));
  it("maps hosts", () => {
    expect(d("https://vt.tiktok.com/x")).toBe("tiktok");
    expect(d("https://fb.watch/x")).toBe("facebook");
    expect(d("https://www.instagram.com/reel/x")).toBe("instagram");
    expect(d("https://youtu.be/x")).toBe("youtube");
    expect(d("https://maps.app.goo.gl/x")).toBe("google_maps");
    expect(d("https://www.google.com/maps/place/x")).toBe("google_maps");
    expect(d("https://www.google.com/travel/hotels/x")).toBe("google_hotels");
    expect(d("https://www.google.co.th/search?q=x")).toBe("google_search");
    expect(d("https://www.booking.com/hotel/th/x.html")).toBe("booking");
    expect(d("https://www.agoda.com/x")).toBe("agoda");
    expect(d("https://www.wongnai.com/r/x")).toBe("review_site");
    expect(d("https://notgoogle.com/maps")).toBe("website");
    expect(d("https://tiktok.com.evil.io/x")).toBe("website");
  });
});

describe("isBlockedIp (SSRF)", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0",
    "224.0.0.1", "::1", "::", "fc00::1", "fd12::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "64:ff9b::a00:1", "2002:a00:1::", "not-an-ip"])(
    "blocks %s", (ip) => expect(isBlockedIp(ip)).toBe(true));
  it.each(["8.8.8.8", "172.32.0.1", "142.250.0.1", "2606:4700::1111", "::ffff:8.8.8.8"])("allows %s", (ip) => expect(isBlockedIp(ip)).toBe(false));
});
