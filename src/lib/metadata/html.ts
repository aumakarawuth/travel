/** Minimal, dependency-free extraction of <title>, meta and JSON-LD from untrusted HTML. Output is plain text only. */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Strip tags/control chars and clamp length. Everything stored from the web goes through here. */
export function cleanText(s: string | undefined | null, max = 1000): string | undefined {
  if (!s) return undefined;
  const t = decodeEntities(s).replace(/<[^>]*>/g, " ").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : undefined;
}

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? (m[2] ?? m[3] ?? m[4]) : undefined;
}

export type PageMeta = {
  title?: string; description?: string; siteName?: string; image?: string; type?: string;
  lat?: number; lng?: number; address?: string; jsonLdNames: string[]; canonical?: string;
};

export function parseHtmlMeta(html: string, baseUrl: string): PageMeta {
  const head = html.slice(0, 400_000);
  const meta: Record<string, string> = {};
  for (const tag of head.match(/<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi) ?? []) {
    const key = (attr(tag, "property") ?? attr(tag, "name") ?? attr(tag, "itemprop"))?.toLowerCase();
    const content = attr(tag, "content");
    if (key && content && !(key in meta)) meta[key] = content;
  }
  const titleTag = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const canonicalTag = (head.match(/<link\b(?=(?:[^>"']|"[^"]*"|'[^']*')*rel\s*=\s*["']?canonical)(?:[^>"']|"[^"]*"|'[^']*')*>/i) ?? [])[0];

  const safeUrl = (u?: string) => {
    if (!u) return undefined;
    try {
      const x = new URL(decodeEntities(u), baseUrl);
      return x.protocol === "https:" || x.protocol === "http:" ? x.toString() : undefined;
    } catch { return undefined; }
  };
  const num = (v?: string) => (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined);

  // JSON-LD: collect names/geo of Place-like entities (schema.org)
  const jsonLdNames: string[] = [];
  let ldLat: number | undefined, ldLng: number | undefined, ldAddress: string | undefined;
  for (const m of head.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const walk = (n: unknown): void => {
        if (!n || typeof n !== "object") return;
        if (Array.isArray(n)) return n.forEach(walk);
        const o = n as Record<string, unknown>;
        const t = String(o["@type"] ?? "");
        if (/Place|Restaurant|Hotel|LodgingBusiness|TouristAttraction|LocalBusiness|CafeOrCoffeeShop|FoodEstablishment/i.test(t)) {
          if (typeof o.name === "string") jsonLdNames.push(o.name);
          const geo = o.geo as Record<string, unknown> | undefined;
          if (geo && ldLat === undefined) { ldLat = num(String(geo.latitude)); ldLng = num(String(geo.longitude)); }
          const a = o.address;
          if (!ldAddress) ldAddress = typeof a === "string" ? a : a && typeof a === "object"
            ? [ (a as Record<string, unknown>).streetAddress, (a as Record<string, unknown>).addressLocality, (a as Record<string, unknown>).addressRegion ].filter(Boolean).join(", ")
            : undefined;
        }
        Object.values(o).forEach((v) => typeof v === "object" && walk(v));
      };
      walk(JSON.parse(m[1]));
    } catch { /* ignore invalid JSON-LD */ }
  }

  const lat = num(meta["place:location:latitude"]) ?? num(meta["og:latitude"]) ?? ldLat;
  const lng = num(meta["place:location:longitude"]) ?? num(meta["og:longitude"]) ?? ldLng;
  return {
    title: cleanText(meta["og:title"] ?? meta["twitter:title"] ?? titleTag, 300),
    description: cleanText(meta["og:description"] ?? meta["description"] ?? meta["twitter:description"], 2000),
    siteName: cleanText(meta["og:site_name"], 100),
    image: safeUrl(meta["og:image"] ?? meta["twitter:image"]),
    type: cleanText(meta["og:type"], 50),
    lat: lat !== undefined && Math.abs(lat) <= 90 ? lat : undefined,
    lng: lng !== undefined && Math.abs(lng) <= 180 ? lng : undefined,
    address: cleanText(ldAddress, 300),
    jsonLdNames: jsonLdNames.map((n) => cleanText(n, 200)!).filter(Boolean).slice(0, 5),
    canonical: safeUrl(canonicalTag ? attr(canonicalTag, "href") : undefined),
  };
}
