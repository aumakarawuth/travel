# TripSync AI — System Design

> เอกสารนี้ครอบคลุมข้อ 1–7 ของ “ก่อนเขียนโค้ด” และเป็นสัญญาการออกแบบสำหรับทุก Phase

## 1. Product Requirements (สรุป)

| กลุ่ม | สิ่งที่ต้องทำได้ | Phase |
|---|---|---|
| Trip | สร้าง/แก้/เก็บถาวร/ลบทริป, วันเดินทาง, จุดเริ่ม–สิ้นสุด, งบ, รูปแบบเดินทาง, เวลาเที่ยวรายวัน, หลายทริป + สลับทริป | 1 |
| Members | Invite Code/Link, บทบาท Owner/Editor/Member, โอนความเป็นเจ้าของ, ออก/นำออก, สีประจำตัว, Realtime | 1 |
| Link Submission | วาง URL → บันทึก original/resolved URL, platform, ผู้ส่ง, เวลา; สถานะ Pending→Analyzing→Needs Review/Completed/Failed; กันซ้ำ; SSRF guard | 2 |
| AI Extraction | Structured JSON (Zod), ยืนยันด้วย Google Places, ห้ามเดาข้อมูล, Confidence ต่ำ → Needs Review | 2 |
| Map | หมุดตามหมวด, clustering, filter, dedupe, List⇄Map sync | 3 |
| Collaboration | โหวต want/maybe/not, คอมเมนต์, Must-visit/Priority, สถานะ proposed→scheduled | 3 |
| Planner | Hybrid optimizer (deterministic + AI อธิบาย), lock & re-optimize, rain plan, unscheduled list | 4 |
| Itinerary | Timeline รายวัน, Drag & Drop, re-check feasibility, สรุปภาษาไทย, Google Maps Directions URL แบ่งช่วง | 4 |
| Accommodation | โรงแรมหลายแห่ง, proposed/confirmed, เป็นจุดจบ/เริ่มของวัน | 4 |
| PWA | Manifest, SW, offline shell, cached trips, Web Share Target | 5 |
| Hardening | rate limit, quotas, monitoring, E2E tests, deploy | 6 |

**Non-goals:** การ scrape ที่ข้ามระบบป้องกันของแพลตฟอร์ม, การอ้างว่าทำงาน offline สำหรับ search/routing, การสร้างราคา/พิกัด/เวลาเปิดโดยไม่มีแหล่งที่มา

## 2. Architecture & Data Flow

```
 ┌────────────── Browser / PWA (Next.js client) ──────────────┐
 │ React Server Components + Client islands, Tailwind/shadcn  │
 │ Supabase JS (anon key) ── Realtime (RLS-filtered) ─────────┼──┐
 │ Service Worker (Phase 5): app shell + trip cache            │  │
 └───────────────┬────────────────────────────────────────────┘  │
                 │ Server Actions / Route Handlers (cookies JWT)  │
 ┌───────────────▼──────────── Vercel (Node runtime) ──────────┐ │
 │ Zod validation → Supabase (user JWT, RLS enforced)           │ │
 │ /api/jobs/worker (Cron, CRON_SECRET) ─ service role ─┐       │ │
 │   ├─ SafeFetcher (DNS+IP allowlist, redirect re-check)│      │ │
 │   ├─ Metadata: OpenGraph / oEmbed / official APIs     │      │ │
 │   ├─ AIProvider (gemini | claude | mock) → Zod schema │      │ │
 │   ├─ Places/Geocoding verification (server key)       │      │ │
 │   └─ Routes API + route_cache                         │      │ │
 └──────────────────────────────────────────────────────┼──────┘ │
                 ┌───────────────────────────────────────▼────────▼┐
                 │ Supabase: Auth · Postgres(RLS) · Storage · Realtime│
                 └──────────────────────────────────────────────────┘
```

หลักการสำคัญ
1. **Database is the security boundary** — ทุกตารางที่ผูกทริปมี `trip_id` + RLS ผ่านฟังก์ชัน `is_trip_member / can_edit_trip / is_trip_owner` (SECURITY DEFINER, กัน RLS recursion). UI permission (`src/lib/permissions.ts`) เป็นเพียงการซ่อนปุ่ม
2. **Mutations ที่ต้อง atomic ทำเป็น RPC** (`create_trip`, `join_trip`, `set_member_role`, `remove_member`, `regenerate_invite_code`)
3. **Secrets อยู่ฝั่ง server เท่านั้น** — service role ใช้เฉพาะใน worker; หน้าเว็บใช้ JWT ของผู้ใช้
4. **Realtime** — client subscribe `postgres_changes` กรองด้วย `trip_id` แล้ว `router.refresh()` (RLS กรองข้อมูลที่ส่งออก)
5. **Hybrid planner** — algorithm deterministic เป็นเจ้าของตัวเลข (เวลา/ระยะ/ข้อจำกัด); AI ทำแค่ตีความความชอบ+อธิบาย

### Data flow: Link → Plan (Phase 2–4)
```
paste URL ─► submitLink action: validate+normalize URL, rate-limit, insert link_submissions(pending)
          └► enqueue ai_extraction_jobs (idempotency_key = submission_id:attempt-generation)
worker ─► claim job (FOR UPDATE SKIP LOCKED) ─► status analyzing
       ─► SafeFetcher: resolve redirects (≤5, each hop re-validated) → resolved_url
       ─► metadata (OG/oEmbed) ─► AI extract (Zod) ─► Places search
       ─► confidence ≥ 0.8 && 1 candidate  → upsert place (dedupe) → completed
          otherwise                         → needs_review (user picks candidate / types name)
       ─► failure → retry with backoff (max 3) → failed (user can enter manually)
review UI ─► confirm place → place_submissions link (many submitters / one place)
map/vote ─► trip_place_selections(status, priority) — never deletes places
planner ─► input snapshot → optimizer → itinerary_versions(n+1) + days + stops → AI explanation
```

## 3. Database Schema

ไฟล์: `supabase/migrations/20261109000001_init.sql` (สร้างครบ 18 ตารางตั้งแต่ Phase 1 เพื่อไม่ต้อง rewrite ภายหลัง)

| ตาราง | หน้าที่ | Key / Constraint สำคัญ |
|---|---|---|
| profiles | ผู้ใช้ (display name, avatar, color, locale) | auto-create จาก trigger `auth.users` |
| trips | ทริป | `day_count` generated, `invite_code` unique (ซ่อนจาก member ด้วย column grants), วันไม่เกิน 61 วัน |
| trip_members | สมาชิก/บทบาท | PK(trip,user), unique partial index = 1 owner ต่อทริป |
| trip_invitations | คำเชิญแบบ token (จำกัดอีเมล/จำนวน/วันหมดอายุ) | role ≠ owner |
| link_submissions | ลิงก์ที่ส่ง + ผู้ส่ง + platform + สถานะ | unique(trip, submitted_by, normalized_url) = idempotent |
| places | สถานที่ unique ต่อทริป | unique(trip, google_place_id); ราคาต้องมี `price_source`; lat/lng ต้องมาคู่; `location_verified` |
| place_sources | หลักฐาน (OG/oEmbed/AI/Places) | |
| place_submissions | many-to-many submission↔place | ตรวจ trip เดียวกันใน RLS |
| place_votes | โหวต | PK(place,user) → 1 คน 1 โหวต (upsert) |
| place_comments | คอมเมนต์ (soft delete) | |
| trip_place_selections | สถานะ/priority/fixed time | ไม่ลบ place |
| accommodations | โรงแรม proposed/confirmed | check_out > check_in; member เสนอได้, editor ยืนยัน |
| itinerary_versions | เวอร์ชันแผน | 1 active ต่อทริป, `routing_source` = google_routes/estimate |
| itinerary_days / itinerary_stops | ตารางรายวัน | lock ต่อวัน/ต่อจุด, rain plan |
| route_cache | cache Routes API | service-role only (RLS ไม่มี policy) |
| ai_extraction_jobs | queue + retry | `idempotency_key` unique, attempts/max_attempts/run_after |
| audit_logs | audit trail | เขียนผ่าน trigger เท่านั้น, owner/editor อ่าน |

## 4. API & Background Jobs

### Phase 1 (implemented)
| Server Action / RPC | ใคร | หมายเหตุ |
|---|---|---|
| `createTripAction` → `create_trip(p jsonb)` | authenticated | สร้าง trip + owner ใน transaction, จำกัด 20 ทริป/วัน |
| `updateTripAction`, `setArchivedAction` | owner/editor | RLS + column grants |
| `deleteTripAction` | owner | cascade |
| `joinTripAction` → `join_trip(code)` | authenticated | code 8 ตัว หรือ token; idempotent; ≤100 คน |
| `preview_invite(code)` | authenticated | คืนข้อมูลขั้นต่ำเท่านั้น |
| `setRoleAction` → `set_member_role` | owner | โอน owner = demote ตัวเองเป็น editor |
| `removeMemberAction` → `remove_member` | owner / editor (เฉพาะ member) | |
| `leaveTripAction` | editor/member | owner ต้องโอนก่อน |
| `regenerateCodeAction`, `setInviteEnabledAction` | owner/editor | |
| `updateProfileAction` | self | ตั้ง cookie locale |
| `GET /auth/callback` | — | PKCE exchange + safe redirect |

### Phase 2+ (planned)
- `POST /api/submissions` (หรือ action) — validate URL, rate limit (`LINK_SUBMISSIONS_PER_MINUTE`), insert + enqueue
- `GET /api/jobs/worker` — Vercel Cron ทุก 1 นาที (+ trigger ทันทีหลัง submit ผ่าน `after()`), header `Authorization: Bearer $CRON_SECRET`
  - claim: `update ... set status='running', locked_at=now(), attempts=attempts+1 where id in (select id ... where status in ('queued','failed') and run_after<=now() and attempts<max_attempts for update skip locked limit 5) returning *`
  - stale lock (> 2 นาที) ถูก reclaim; backoff `run_after = now() + 2^attempts min`; หมด attempts → `dead` + submission `failed`
  - งานทุกขั้นเขียนผลแบบ upsert จึง retry ซ้ำได้ (idempotent)
- `/share-target` (Phase 5) — รับ `url`/`text` จาก OS share sheet → prefill/auto-submit

## 5. โครงสร้างโฟลเดอร์

```
src/
  app/
    (app)/                 # หน้าที่ต้อง login
      trips/page.tsx       # My Trips + join
      trips/new/           # Create Trip
      trips/[tripId]/      # layout (switcher, nav, realtime) + overview
        members/ settings/ inbox/ map/ plan/
      join/[code]/         # invite landing
      profile/
    actions/               # server actions (trips, members, profile)
    auth/callback/         # PKCE
    login/
  components/ui/           # shadcn-style primitives
  components/              # trip-form, trip-nav, realtime-refresh, ...
  i18n/                    # th (default), en
  lib/
    supabase/              # server/client/middleware clients
    validation/            # zod schemas
    permissions.ts invite.ts safe-redirect.ts trip-data.ts
  middleware.ts            # session refresh + auth gate
supabase/
  migrations/              # SQL migrations
  tests/                   # vanilla-Postgres stub + RLS tests
tests/unit/                # vitest
scripts/test-db.sh
docs/
```
Phase ถัดไปจะเพิ่ม `src/lib/{url-safety,fetcher,metadata,ai,places,routing,optimizer,dedupe}/` และ `src/app/api/jobs/`

## 6. API Keys, Environment Variables, ค่าใช้จ่าย

ดู `.env.example` — ตัวแปร `NEXT_PUBLIC_*` เท่านั้นที่ถึง browser

| Service | ใช้ทำอะไร | ค่าใช้จ่ายโดยประมาณ (ตรวจราคาล่าสุดเสมอ) |
|---|---|---|
| Supabase | Auth/DB/Realtime/Storage | Free tier (500MB DB, pause หลังไม่ใช้ 7 วัน); Pro ~$25/เดือน |
| Vercel | Hosting + Cron | Hobby ฟรี (cron จำกัด, ไม่ใช่เชิงพาณิชย์); Pro ~$20/คน/เดือน |
| Google Maps JS | แผนที่ | คิดตาม map load; มีเครดิต/โควตาฟรีรายเดือนตาม SKU |
| Places API (New) | ค้นหา/ยืนยันสถานที่ | คิดต่อ request ตาม field mask — ใช้ field mask ให้แคบที่สุด |
| Geocoding | address→lat/lng | ต่อ request |
| Routes API | Compute Routes / Route Matrix | ต่อ element; matrix N×N โตเร็ว → cache + จำกัด N |
| Gemini / Claude | สกัดข้อมูล + อธิบายแผน | ต่อ token; ใช้โมเดลเล็กสำหรับ extraction, จำกัดงาน/วัน |

Guardrails: `AI_MAX_JOBS_PER_USER_PER_DAY`, `AI_MAX_JOBS_PER_TRIP_PER_DAY`, ตั้ง quota + budget alert ใน Google Cloud Console, จำกัด key ด้วย HTTP referrer (browser) / API restriction (server)

## 7. ความเสี่ยงของ Social Media Extraction

- **TikTok / Instagram / Facebook** มักต้อง login, บล็อก bot, หรือคืนหน้า JS ว่าง → **ไม่รับประกัน** ว่าจะอ่านได้
  - ใช้ได้เฉพาะสิ่งที่เปิดสาธารณะ: Open Graph tags, oEmbed (TikTok มี public oEmbed; Meta oEmbed ต้องมี App token + review)
  - ข้อความ caption อาจไม่มีชื่อสถานที่เลย → AI ต้องตอบ `missingFields` แทนการเดา
- **ไม่ทำ:** headless login, ปลอม UA เพื่อข้าม protection, ดาวน์โหลดวิดีโอ, เก็บภาพที่ไม่มีสิทธิ์ (เก็บเฉพาะ URL thumbnail จาก OG/oEmbed พร้อมระบุแหล่ง และแสดงลิงก์ต้นฉบับ)
- **Fallback:** สถานะ Needs Review → ผู้ใช้พิมพ์ชื่อ / เลือกจาก Google Places / แนบข้อความหรือรูปประกอบ
- Short link (vt.tiktok.com, maps.app.goo.gl, fb.watch) ต้อง resolve redirect ผ่าน SafeFetcher ทีละ hop
- Google Maps URL บางแบบมี place id/coords ใน URL → parse ได้แน่นอนกว่า AI
- Booking/Agoda: ราคาเปลี่ยนตามวัน/ผู้ใช้ → เก็บเป็น “ราคาที่เห็น ณ วันที่ …” พร้อม `price_source`
- ToS และลิขสิทธิ์: แสดงเครดิตแหล่งที่มา, ไม่ re-host สื่อ, เคารพ robots/terms
