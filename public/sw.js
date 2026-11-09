/* TripSync AI service worker — hand-written, no build step.
 * - App shell + static assets: cache-first (/_next/static is content-hashed, immutable)
 * - Page navigations: network-first; successful trip pages are kept so they can be READ offline
 * - Never cached: non-GET, cross-origin (Supabase, Google, AI), /api, server actions, RSC payloads
 * Live place search, link analysis and route calculation need the network — we do not pretend otherwise.
 */
const VERSION = "v2";
const SHELL = `shell-${VERSION}`;
const STATIC = `static-${VERSION}`;
const PAGES = `pages-${VERSION}`;
const MAX_PAGES = 40;
const PRECACHE = ["/offline.html", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL, STATIC, PAGES]);
    for (const k of await caches.keys()) if (!keep.has(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data === "clear-pages") event.waitUntil(caches.delete(PAGES));
});

const isCacheablePage = (url) => url.pathname === "/trips" || url.pathname.startsWith("/trips/");

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_PAGES; i++) await cache.delete(keys[i]);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname === "/share" || req.headers.get("RSC") || url.searchParams.has("_rsc") || req.headers.get("Next-Action")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(caches.open(STATIC).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok && res.type === "basic" && isCacheablePage(url)) {
          const c = await caches.open(PAGES);
          // store without query (?url=… from share target etc.)
          await c.put(url.origin + url.pathname, res.clone());
          trim(c);
        }
        return res;
      } catch {
        const cached = await caches.match(url.origin + url.pathname, { cacheName: PAGES });
        if (cached) return cached;
        return (await caches.match("/offline.html", { cacheName: SHELL })) ?? new Response("Offline", { status: 503 });
      }
    })());
  }
});
