# Deployment Guide (Supabase + Vercel)

## Supabase (production)
1. สร้างโปรเจกต์ใหม่ (region ใกล้ผู้ใช้ เช่น Singapore `ap-southeast-1`)
2. Apply migrations: `supabase link --project-ref <ref> && supabase db push`
3. Auth → URL Configuration
   - Site URL: `https://<your-domain>`
   - Redirect URLs: `https://<your-domain>/auth/callback`, `https://*-<team>.vercel.app/auth/callback` (preview)
4. Auth → SMTP: ตั้ง custom SMTP สำหรับ production (built-in มี rate limit ต่ำ)
5. Auth → Rate limits / CAPTCHA: แนะนำเปิด CAPTCHA (hCaptcha/Turnstile) เมื่อเปิดสาธารณะ
6. ตรวจ **Advisors** (Security/Performance) ใน dashboard หลัง migrate

## Vercel
1. Import repo → Framework: Next.js
2. Environment Variables (Production + Preview)
   | Name | Scope |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | public |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public |
   | `NEXT_PUBLIC_SITE_URL` | public (`https://<your-domain>`) |
   | `SUPABASE_SERVICE_ROLE_KEY` | **server only** (Phase 2+) |
   | `GOOGLE_MAPS_SERVER_KEY`, `GEMINI_API_KEY`/`ANTHROPIC_API_KEY`, `CRON_SECRET` | **server only** (Phase 2+) |
3. Deploy → ตั้ง custom domain → อัปเดต Site URL ใน Supabase ให้ตรง
4. Phase 2 จะเพิ่ม `vercel.json` cron สำหรับ `/api/jobs/worker`

## Checklist หลัง deploy
- [ ] สมัคร/ล็อกอิน/magic link ทำงาน, redirect กลับ `/auth/callback` ได้
- [ ] สร้างทริป, เชิญเพื่อนด้วยลิงก์จากอีกบัญชี, เห็นรายชื่อแบบ realtime
- [ ] บัญชีที่ไม่ใช่สมาชิกเปิด `/trips/<id>` ได้ 404
- [ ] Security headers (`X-Frame-Options: DENY`, `nosniff`) อยู่ใน response
