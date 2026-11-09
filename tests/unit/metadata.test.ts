import { describe, expect, it } from "vitest";
import { cleanText, parseHtmlMeta } from "@/lib/metadata/html";
import { parseGoogleMapsUrl } from "@/lib/metadata/google-maps";

describe("parseHtmlMeta", () => {
  const html = `<html><head><title>Fallback</title>
    <meta property="og:title" content="Café &amp; Bake | Chiang Mai">
    <meta name="description" content="<script>alert(1)</script>ขนมอร่อย ราคา 120 บาท">
    <meta property="og:image" content="/img/a.jpg">
    <meta property="og:site_name" content="Wongnai">
    <script type="application/ld+json">{"@type":"Restaurant","name":"Café & Bake","geo":{"latitude":18.79,"longitude":98.98},"address":{"streetAddress":"1 Nimman","addressLocality":"Chiang Mai"}}</script>
    </head></html>`;
  const m = parseHtmlMeta(html, "https://www.wongnai.com/r/1");
  it("reads OG, decodes entities, strips markup", () => {
    expect(m.title).toBe("Café & Bake | Chiang Mai");
    expect(m.description).toBe("alert(1) ขนมอร่อย ราคา 120 บาท");
    expect(m.description).not.toContain("<");
    expect(m.image).toBe("https://www.wongnai.com/img/a.jpg");
    expect(m.siteName).toBe("Wongnai");
  });
  it("reads JSON-LD place data", () => {
    expect(m.jsonLdNames).toEqual(["Café & Bake"]);
    expect([m.lat, m.lng]).toEqual([18.79, 98.98]);
    expect(m.address).toBe("1 Nimman, Chiang Mai");
  });
  it("refuses javascript: image URLs", () => {
    expect(parseHtmlMeta(`<meta property="og:image" content="javascript:alert(1)">`, "https://a.com").image).toBeUndefined();
  });
  it("cleanText clamps and removes control chars", () => {
    expect(cleanText("a\u0000b  c", 10)).toBe("ab c");
    expect(cleanText("x".repeat(50), 5)).toBe("xxxxx");
  });
});

describe("parseGoogleMapsUrl", () => {
  it("prefers the !3d!4d pin over the @ viewport", () => {
    const r = parseGoogleMapsUrl("https://www.google.com/maps/place/Doi+Suthep/@18.80,98.90,15z/data=!4m6!3m5!1s0x0:0x0!8m2!3d18.8048!4d98.9216");
    expect(r).toMatchObject({ name: "Doi Suthep", lat: 18.8048, lng: 98.9216, precise: true });
  });
  it("viewport-only coords are not precise", () => {
    expect(parseGoogleMapsUrl("https://www.google.com/maps/place/X/@13.7,100.5,15z")).toMatchObject({ lat: 13.7, precise: false });
  });
  it("handles ?api=1 search links and place ids", () => {
    expect(parseGoogleMapsUrl("https://www.google.com/maps/search/?api=1&query=Wat%20Arun&query_place_id=ChIJabcdefghij"))
      .toMatchObject({ name: "Wat Arun", placeId: "ChIJabcdefghij" });
    expect(parseGoogleMapsUrl("https://maps.google.com/?q=13.75,100.49")).toMatchObject({ lat: 13.75, lng: 100.49, precise: true });
  });
  it("ignores non-maps URLs", () => {
    expect(parseGoogleMapsUrl("https://www.google.com/search?q=x")).toBeNull();
    expect(parseGoogleMapsUrl("https://evil.com/maps/place/x")).toBeNull();
  });
});
