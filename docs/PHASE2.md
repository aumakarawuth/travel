# Phase 2 — Link Submission, Extraction, AI, Review

## Flow
paste/share URL → `submitLinkAction` (validate, normalise, rate-limit 10/min, dedupe per user) → `after()` runs
`processSubmission` (job row keyed `submissionId:attempt` = idempotent) → SafeFetch (SSRF guard, ≤5 redirects,
1.5 MB, 10 s) → Open Graph / JSON-LD / oEmbed (YouTube, TikTok) / Google Maps URL parse → AI provider
(Gemini | Claude | **MOCK**) → Google Places Text Search (if key) → `decide()` → completed **or** needs_review.

## Rules that prevent made-up data
- AI schema has **no coordinate fields**. Coordinates come only from a precise Google Maps pin, a single/exact Places match, or page markup (page markup still requires user confirmation).
- Price kept only if the AI quotes a literal substring of the evidence containing that number; stored with source URL + date.
- Opening hours only from Google Places, with source + check date.
- Mock AI can never auto-complete (confidence capped 0.3, badge “MOCK”). A precise Google Maps link is deterministic and completes without AI.
- Facebook/Instagram login walls are detected and shown as “please enter the place name”.
- Several Places candidates → user chooses; nothing is pinned automatically.

## Acceptance criteria
| # | Criterion | Test |
|---|---|---|
| B1 | Paste URL + Add (or paste directly in the field) from Overview or Inbox | manual |
| B2 | Original URL, resolved URL, platform, submitter, time stored | integration `submission-flow` |
| B3 | Statuses pending → analyzing → needs_review / completed / failed update live | manual (realtime) |
| B4 | Unsafe URLs (private IP, localhost, metadata IP, DNS rebinding, bad ports/protocols, credentials) refused | unit `url-safety`, `safe-fetch` |
| B5 | Duplicate link by the same user is idempotent; same place from two members merges with both submitters | DB unique + integration |
| B6 | AI output validated by Zod; unknown category → other | unit `dedupe-decide` |
| B7 | No coordinates/prices without evidence | unit `dedupe-decide` |
| B8 | Review dialog: edit name/category, search Places, choose candidate / link pin / no pin | manual |
| B9 | Retry (≤5 attempts) and delete own submission | manual |
| B10 | Daily AI quota per user/trip falls back to mock | code `process.ts` |
| B11 | Place detail shows sources, submitters, price/hours with source + date | manual |

## Enable real AI / Places
Vercel → Project → Settings → Environment Variables:
- `GEMINI_API_KEY` (+ `AI_PROVIDER=gemini`) **or** `ANTHROPIC_API_KEY` (+ `AI_PROVIDER=claude`)
- `GOOGLE_MAPS_SERVER_KEY` with *Places API (New)* enabled, restricted to that API
Redeploy after adding.
