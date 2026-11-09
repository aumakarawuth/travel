import "server-only";
import { safeFetch, SafeFetchError } from "@/lib/url/safe-fetch";
import { detectPlatform, type Platform } from "@/lib/url/normalize";
import { cleanText, parseHtmlMeta, type PageMeta } from "./html";
import { parseGoogleMapsUrl, type MapsUrlInfo } from "./google-maps";

export type Evidence = {
  sourceType: "open_graph" | "oembed" | "google_maps_url";
  url: string;
  fields: Record<string, string | number | undefined>;
};

export type LinkMetadata = {
  resolvedUrl: string;
  platform: Platform;
  page?: PageMeta;
  oembed?: { title?: string; author?: string; thumbnail?: string; provider?: string };
  maps?: MapsUrlInfo | null;
  evidence: Evidence[];
  fetchError?: string;
  blockedByPlatform: boolean;
};

/** Official public oEmbed endpoints that need no token. Meta (FB/IG) oEmbed needs an app token → not used. */
function oembedEndpoint(platform: Platform, url: string): string | null {
  const e = encodeURIComponent(url);
  if (platform === "youtube") return `https://www.youtube.com/oembed?format=json&url=${e}`;
  if (platform === "tiktok") return `https://www.tiktok.com/oembed?url=${e}`;
  return null;
}

export async function fetchLinkMetadata(originalUrl: string): Promise<LinkMetadata> {
  const evidence: Evidence[] = [];
  let resolvedUrl = originalUrl;
  let page: PageMeta | undefined;
  let fetchError: string | undefined;

  try {
    const res = await safeFetch(originalUrl);
    resolvedUrl = res.finalUrl;
    if (res.body) page = parseHtmlMeta(res.body, res.finalUrl);
  } catch (e) {
    fetchError = e instanceof SafeFetchError ? e.code : "network";
    if (e instanceof SafeFetchError && (e.code === "blocked_url" || e.code === "blocked_ip")) throw e; // never continue on SSRF
  }

  const platform = detectPlatform(new URL(resolvedUrl));
  // login walls return generic titles like "Instagram" / "Facebook" — treat as no data
  const generic = /^(instagram|facebook|log in|login|tiktok - make your day|เข้าสู่ระบบ)/i;
  const blockedByPlatform = (platform === "instagram" || platform === "facebook") && (!page?.title || generic.test(page.title));
  if (page && !blockedByPlatform && (page.title || page.description)) {
    evidence.push({ sourceType: "open_graph", url: resolvedUrl, fields: {
      title: page.title, description: page.description?.slice(0, 500), siteName: page.siteName,
      lat: page.lat, lng: page.lng, address: page.address, jsonLdNames: page.jsonLdNames.join(" | ") || undefined,
    } });
  }

  let oembed: LinkMetadata["oembed"];
  const ep = oembedEndpoint(platform, resolvedUrl);
  if (ep) {
    try {
      const r = await safeFetch(ep, { accept: "application/json", json: true, timeoutMs: 6000 });
      const j = JSON.parse(r.body) as Record<string, unknown>;
      oembed = {
        title: cleanText(String(j.title ?? ""), 500), author: cleanText(String(j.author_name ?? ""), 100),
        thumbnail: typeof j.thumbnail_url === "string" && /^https:\/\//.test(j.thumbnail_url) ? j.thumbnail_url : undefined,
        provider: cleanText(String(j.provider_name ?? ""), 50),
      };
      evidence.push({ sourceType: "oembed", url: ep, fields: { title: oembed.title, author: oembed.author, provider: oembed.provider } });
    } catch { /* oEmbed is best-effort */ }
  }

  const maps = platform === "google_maps" ? parseGoogleMapsUrl(resolvedUrl) ?? parseGoogleMapsUrl(originalUrl) : null;
  if (maps) evidence.push({ sourceType: "google_maps_url", url: resolvedUrl, fields: { name: maps.name, lat: maps.lat, lng: maps.lng, placeId: maps.placeId, precise: String(maps.precise) } });

  return { resolvedUrl, platform, page: blockedByPlatform ? undefined : page, oembed, maps, evidence, fetchError, blockedByPlatform };
}
