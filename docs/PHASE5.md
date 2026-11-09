# Phase 5 — PWA, Share Target, Offline UX

## Install
- `src/app/manifest.ts` → `/manifest.webmanifest`: standalone, `start_url=/trips`, theme `#0f766e`, icons 192/512 + maskable, apple-touch-icon.
- "Install app" button appears in the header only when the browser fires `beforeinstallprompt` (Chrome/Edge/Android).
  iOS Safari: Share → *Add to Home Screen* (no install prompt API).

## Share Target (Android / desktop Chrome, installed app only)
`share_target` (GET) → `/share?url&text&title`. The link is extracted from any field (Android usually sends it in `text`),
validated, then sent to the **last opened trip** (cookie `last_trip`), or the only trip, or a trip chooser.
The Inbox submits it once automatically (`share_channel = share_target`) and removes the query so refresh doesn't resubmit.
**iOS does not support Web Share Target** — copy the link and paste it into the Inbox instead.

## Offline
`public/sw.js` (hand-written, versioned caches):
| Request | Strategy |
|---|---|
| `/_next/static/*`, `/icons/*` | cache-first (content-hashed) |
| page navigations under `/trips` | network-first; last 40 successful pages kept for offline **reading** |
| other navigations offline | `/offline.html` (self-contained, no JS) |
| non-GET, cross-origin (Supabase, Google, AI), `/api`, RSC, server actions, `/share` | never cached |

- Offline banner (`navigator.onLine`) explains what does and doesn't work; "Add link" is disabled offline.
- Not available offline (by design, stated in UI): link analysis, Places search, route calculation, map tiles, saving changes.
- Profile → **Clear offline data** removes cached trip pages from the device.
- Service worker is registered only in production builds.

## Acceptance criteria
| # | Criterion | Test |
|---|---|---|
| E1 | Manifest valid & installable, icons exist | unit `pwa` |
| E2 | Share target declared; link extracted from text | unit `pwa`, manual on Android |
| E3 | Previously opened trip page readable with server unreachable | headless prod test (server stopped) ✔ |
| E4 | Never-opened page offline → offline page (no crash) | headless prod test ✔ |
| E5 | Offline banner appears/disappears with connectivity | headless test ✔ |
| E6 | SW never caches API / cross-origin / mutations | unit `pwa` (policy) |
| E7 | Mobile-first layout, bottom nav, safe-area insets | manual |

Note: headless tests had to stop the server instead of using Playwright's offline flag — Chromium's emulated offline
mode does not reach service-worker fetches, so it doesn't reflect real offline behaviour.
