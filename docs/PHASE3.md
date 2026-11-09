# Phase 3 — Map, Dedupe, Filters, Voting

## Map
- `MapView` adapter: **Google Maps JS** (AdvancedMarker + MarkerClusterer) when `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` is set,
  otherwise **Leaflet + OpenStreetMap** (labelled on screen).
- Pins coloured + emoji per category, clustered; only `location_verified` places with coordinates are pinned — others are listed under “no verified location”.
- Filters: text, category (multi), member, status, selected/unselected, max price (unknown prices kept).
- Map ⇄ List share one selection; mobile toggles Map/List, desktop shows both.
- Card: image (with source), name, category, price, submitters, votes, status/priority (owner/editor), details, directions
  (official `maps/dir/?api=1`), Google Maps (`maps/search/?api=1` + place id), original link.

## Collaboration
- Votes want/maybe/not_interested, one per member, re-click to clear, optimistic UI, voter list.
- Status proposed/shortlisted/selected/rejected (+ scheduled by planner) and priority — owner/editor only (RLS).
- Comments with soft delete; 20/min limit.
- Members page: per-member links / places / want votes and most-popular places.

## Acceptance criteria
| # | Criterion | Test |
|---|---|---|
| C1 | Category pins, clustering, no pin without verified coords | unit `explore`, headless render check |
| C2 | Filters category/member/status/budget/selection/search | unit `explore` |
| C3 | Map/list selection synced; official Maps URLs | unit `explore`, manual |
| C4 | One vote per member, toggle, counts + voters | RLS test, manual |
| C5 | Only owner/editor change status/priority | RLS test |
| C6 | Comments; only author soft-deletes | RLS test |
| C7 | Member summary + most popular | unit `memberSummary` |
| C8 | Realtime refresh on votes/selections/comments | manual |

## Enabling Google Maps
Browser key restricted to *Maps JavaScript API* + referrer `https://tripsync-ai-five.vercel.app/*` →
`NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` in Vercel → redeploy.
