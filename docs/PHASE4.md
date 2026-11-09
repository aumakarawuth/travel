# Phase 4 — Route Optimisation, Daily Itinerary, Maps Links, Hotels

## Hybrid optimiser (`src/lib/planner/`)
Deterministic (owns all numbers):
1. **Input** (`build-input.ts`): places with status *selected/scheduled* and verified coords (others → unscheduled `no_location`);
   visit time from the place or a per-category default (flagged); opening hours only from Google Places `periods` (unknown → flagged, never guessed);
   fixed booking time / preferred day; locks from the active version. Hotels: the hotel of night *N* (`check_in ≤ N < check_out`, confirmed first) ends day *N* and starts day *N+1*.
2. **Cluster** (`cluster.ts`): capacity-aware k-means by geography; hotel anchors; locked/fixed/preferred dates honoured.
3. **Order** (`order.ts`): nearest neighbour + 2-opt (no back-tracking); with locked stops → cheapest insertion around them.
4. **Simulate** (`simulate.ts`): travel + traffic % + per-stop buffer, lunch/dinner breaks (a restaurant visit counts as the meal), wait for opening, fixed-time checks, return to hotel.
5. **Repair** (`optimize.ts`): over time → drop optional → normal → high (must-visit last), then try every other day; leftovers listed with a reason
   (`not_enough_time`, `closed`, `outside_trip_dates`, `no_location`).
6. **Two-pass routing** (`run.ts`): pass 1 straight-line estimate decides day groups; pass 2 uses Google **Routes API computeRouteMatrix** per day (≤25 points, cost cap `PLANNER_MAX_MATRIX_ELEMENTS`). Without a key every leg is marked *estimate* and the UI says so.
AI part: explanations are template-based today (deterministic, Thai/English); an AI wording layer can be added on top without touching numbers.

Rain plan: indoor places only (removes nature / viewpoint / outdoor activity).

## Itinerary
- Every run / manual edit = new `itinerary_versions` row (old ones kept, can be re-activated); rows in `itinerary_days` / `itinerary_stops`; full result in `input_snapshot`.
- Selections become `scheduled`; places that fall out return to `selected`.
- UI: per day — date, depart, stops (travel time/km, arrive, wait, visit, leave, cost, source link, notes), meals, return to hotel, Thai summary
  (`วันที่ 1: ออกเดินทางจากโรงแรม … 09:00 → … → กลับโรงแรม … 18:00`), totals, feasibility badge, explanation, day route map (straight connectors, labelled).
- Drag & drop (desktop) + up/down + "move to day" (mobile), lock stop / lock day → **Save & re-check** recomputes times without re-optimising;
  **Re-optimise** keeps locked parts.

## Google Maps links (`links.ts`)
Official Maps URLs `https://www.google.com/maps/dir/?api=1&origin=…&destination=…&waypoints=…&travelmode=…` (+ place ids).
Split into continuous segments of ≤3 waypoints (mobile browser limit); Copy Route, Open in Google Maps, Copy Daily Summary, Share trip (Web Share API or clipboard).
Google Maps may still reorder if the user edits the route in the app.

## Accommodation
Add from an *accommodation* place (verified coords) or by name (no coords → not used as start/end, shown). Dates, price/night, rooms, booking ref; proposed ⇄ confirmed.

## Acceptance criteria
| # | Criterion | Test |
|---|---|---|
| D1 | Places grouped by geography, far cities on different days, hotels anchor days | unit `planner` |
| D2 | Order improves NN with 2-opt; locked order preserved | unit `planner` |
| D3 | Opening hours respected incl. overnight; unknown flagged | unit `planner` |
| D4 | Fixed-time conflict and over-time detected | unit `planner` |
| D5 | Lowest priority dropped first with reason; must-visit kept; closed places moved to open days | unit `planner` |
| D6 | No real-time claim without Routes API (estimate flag + banner) | unit + UI |
| D7 | Hotel of night N ends day N / starts N+1; confirmed preferred | unit `build-input` |
| D8 | Maps directions split into continuous ≤3-waypoint segments | unit `planner` |
| D9 | Thai daily summary format | unit `planner` |
| D10 | Manual reorder/move/lock → re-check feasibility, new version, history kept | manual + headless render |
| D11 | Submission → Extraction → Review → Map → Planner | integration `submission-flow` |

## Enable real road times
`GOOGLE_MAPS_SERVER_KEY` with **Routes API** enabled (same key as Places). Optional `PLANNER_MAX_MATRIX_ELEMENTS` (default 2000 elements per run).
