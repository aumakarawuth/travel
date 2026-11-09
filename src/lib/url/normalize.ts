/** URL validation, normalisation (for dedupe) and platform detection. Pure functions — unit tested. */

export type Platform =
  | "tiktok" | "facebook" | "instagram" | "youtube" | "google_maps" | "google_search"
  | "google_hotels" | "booking" | "agoda" | "review_site" | "website";

const TRACKING_PARAMS = [
  /^utm_/i, /^fbclid$/i, /^gclid$/i, /^igshid$/i, /^igsh$/i, /^si$/i, /^_t$/i, /^_r$/i, /^mibextid$/i,
  /^is_from_webapp$/i, /^sender_device$/i, /^share_app_id$/i, /^ref$/i, /^ref_src$/i, /^feature$/i, /^aid$/i,
];

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: "empty" | "invalid" | "protocol" | "credentials" | "port" | "host" | "too_long" };

/** Pull the first http(s) URL out of free text (share sheets often send "caption https://…"). */
export function extractUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s<>"'`]+/i);
  return m ? m[0].replace(/[),.!?]+$/, "") : null;
}

export function checkUrl(raw: string): UrlCheck {
  const input = (extractUrl(raw) ?? raw).trim();
  if (!input) return { ok: false, reason: "empty" };
  if (input.length > 2048) return { ok: false, reason: "too_long" };
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(input) ? input : `https://${input}`);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, reason: "protocol" };
  if (url.username || url.password) return { ok: false, reason: "credentials" };
  if (url.port && url.port !== "80" && url.port !== "443") return { ok: false, reason: "port" };
  const host = url.hostname.toLowerCase();
  // literal IPs, localhost and single-label hosts are never valid travel links
  if (!host.includes(".") || host.endsWith(".local") || host.endsWith(".internal") || host === "localhost" ||
      /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.startsWith("[")) {
    return { ok: false, reason: "host" };
  }
  return { ok: true, url };
}

/** Canonical form used for duplicate detection. */
export function normalizeUrl(url: URL): string {
  const u = new URL(url.toString());
  u.protocol = "https:";
  u.hostname = u.hostname.toLowerCase().replace(/^(www|m|mobile)\./, "");
  u.hash = "";
  u.port = "";
  for (const key of [...u.searchParams.keys()]) {
    if (TRACKING_PARAMS.some((re) => re.test(key))) u.searchParams.delete(key);
  }
  u.searchParams.sort();
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");
  return u.toString();
}

const is = (host: string, ...domains: string[]) => domains.some((d) => host === d || host.endsWith("." + d));

export function detectPlatform(url: URL): Platform {
  const h = url.hostname.toLowerCase();
  const p = url.pathname;
  if (is(h, "tiktok.com")) return "tiktok";
  if (is(h, "facebook.com", "fb.com", "fb.watch")) return "facebook";
  if (is(h, "instagram.com", "instagr.am")) return "instagram";
  if (is(h, "youtube.com", "youtu.be")) return "youtube";
  if (is(h, "maps.app.goo.gl", "goo.gl") || (is(h, "google.com", "google.co.th") && p.startsWith("/maps")) || is(h, "maps.google.com", "maps.google.co.th"))
    return "google_maps";
  if (is(h, "google.com", "google.co.th") && p.startsWith("/travel/hotels")) return "google_hotels";
  if (is(h, "google.com", "google.co.th") && p.startsWith("/search")) return "google_search";
  if (is(h, "booking.com")) return "booking";
  if (is(h, "agoda.com")) return "agoda";
  if (is(h, "tripadvisor.com", "tripadvisor.co.th", "wongnai.com", "yelp.com", "pantip.com")) return "review_site";
  return "website";
}

/** Platforms that usually block anonymous reads — we tell the user up front instead of pretending. */
export function isRestrictedPlatform(p: Platform): boolean {
  return p === "facebook" || p === "instagram";
}
