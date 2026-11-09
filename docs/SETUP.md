# Setup Guide (Local)

## 1. Requirements
- Node.js 20+ (ทดสอบกับ 22)
- บัญชี Supabase (หรือ Supabase CLI + Docker สำหรับ local stack)
- (ทางเลือก) PostgreSQL client `psql` สำหรับรัน RLS tests

## 2. Supabase project
1. สร้างโปรเจกต์ที่ https://supabase.com/dashboard
2. **SQL Editor** → วางเนื้อหา `supabase/migrations/20261109000001_init.sql` → Run
   หรือใช้ CLI: `supabase link --project-ref <ref> && supabase db push`
3. **Authentication → URL Configuration**
   - Site URL: `http://localhost:3000`
   - Redirect URLs: `http://localhost:3000/auth/callback`
4. **Authentication → Providers → Email**: เปิด (จะปิด “Confirm email” ระหว่าง dev ก็ได้)
5. **Database → Publications**: ตรวจว่า `supabase_realtime` มีตาราง trips, trip_members ฯลฯ (migration เพิ่มให้แล้ว)
6. **Project Settings → API**: คัดลอก Project URL และ `anon` key

## 3. Environment
```bash
cp .env.example .env.local
```
กรอก `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`
Phase 1 ไม่ต้องใช้ Google/AI keys (`AI_PROVIDER=mock` ใช้ใน Phase 2 โดยผลลัพธ์จะติดป้าย “MOCK” ชัดเจน)

## 4. Run
```bash
npm install
npm run dev     # http://localhost:3000
```

## 5. Local Supabase (ทางเลือก)
```bash
npx supabase init     # ครั้งแรก (เก็บ supabase/migrations ไว้)
npx supabase start    # ต้องมี Docker; จะ apply migrations อัตโนมัติ
```
ใช้ URL/anon key ที่ CLI แสดงใน `.env.local`

## 6. Tests
```bash
npm test
npm run typecheck
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54322/postgres scripts/test-db.sh   # หรือ Postgres ใดก็ได้
```
`scripts/test-db.sh` สร้าง DB ชั่วคราว, ติดตั้ง stub ของ `auth` schema (`supabase/tests/00_supabase_stub.sql`), apply migrations แล้วรัน `supabase/tests/01_rls_test.sql`
