# TripSync AI ✈️

เว็บแอป PWA สำหรับวางแผนเที่ยวร่วมกันเป็นกลุ่ม — สมาชิกแชร์ลิงก์ (TikTok, IG, Google Maps, Agoda ฯลฯ) แล้ว AI ช่วยจัดหมวดหมู่ ปักหมุด และสร้างแผนเที่ยวรายวันที่คำนึงถึงเวลาเดินทางจริง

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind + shadcn-style UI · Supabase (Auth/Postgres/RLS/Realtime) · Zod · Vitest · Vercel

## สถานะ

| Phase | ขอบเขต | สถานะ |
|---|---|---|
| 1 | Architecture, DB schema + RLS, Auth, Trip CRUD, Invite/Roles, Realtime | ✅ เสร็จ (รอตรวจ) |
| 2 | URL submission, metadata, AI extraction, review | ✅ (รอตรวจ) |
| 3 | Google Maps, dedupe, filters, voting | ✅ (รอตรวจ) |
| 4 | Optimizer, itinerary, Maps links, hotels | ✅ (รอตรวจ) |
| 5 | PWA, Share Target, offline | ⏳ |
| 6 | Hardening, E2E, deploy | ⏳ |


## เอกสาร
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — requirements, architecture, schema, API/jobs, env & cost, social-media risks
- [docs/SETUP.md](docs/SETUP.md) — ติดตั้งและรันในเครื่อง
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Deploy Supabase + Vercel
- [docs/PHASE1.md](docs/PHASE1.md) / [docs/PHASE2.md](docs/PHASE2.md) / [docs/PHASE3.md](docs/PHASE3.md) / [docs/PHASE4.md](docs/PHASE4.md) — Acceptance criteria และวิธีทดสอบ

## Quick start
```bash
npm install
cp .env.example .env.local   # ใส่ค่า Supabase
npm run dev
```

## Tests
```bash
npm test                 # unit tests (vitest)
npm run typecheck
scripts/test-db.sh       # apply migrations + RLS tests บน Postgres (ต้องมี psql)
```
