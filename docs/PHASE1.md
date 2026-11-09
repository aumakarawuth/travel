# Phase 1 — Acceptance Criteria & Test Plan

## Scope
Architecture, database schema (ทุกตารางของระบบ), RLS, Auth, Trip CRUD, Invite members, roles, realtime roster, multi-trip switch, i18n (TH default/EN), dark mode

## Acceptance Criteria
| # | Criterion | ทดสอบโดย |
|---|---|---|
| A1 | สมัครด้วยอีเมล/รหัสผ่าน หรือ magic link แล้วมี profile อัตโนมัติ (ชื่อ + สีประจำตัว) | RLS test `profile auto-created`, manual |
| A2 | สร้างทริปด้วยฟอร์มสั้น (ชื่อ+วัน) — ตั้งค่าอื่นพับไว้ใน “ตั้งค่าเพิ่มเติม” | manual |
| A3 | ผู้สร้างเป็น Owner คนเดียว; validation วัน/เวลา (ทั้ง Zod และ DB constraint) | unit `validation.test.ts`, RLS test |
| A4 | Owner/Editor เห็น Invite Code + Link, คัดลอก/แชร์ (Web Share API), สร้างโค้ดใหม่, ปิด/เปิดการเชิญ | RLS test `invite code`, manual |
| A5 | Member ไม่เห็น invite code (column privilege) | RLS test `invite_code column hidden` |
| A6 | ผู้ใช้ที่ login แล้วเปิด `/join/CODE` เห็นพรีวิวและเข้าร่วมได้; ยังไม่ login → login แล้วกลับมาหน้าเดิม | manual, unit `safeNextPath` |
| A7 | เข้าร่วมซ้ำไม่ error (idempotent); โค้ดผิด/ปิด → แจ้งข้อผิดพลาด | RLS test |
| A8 | Owner เปลี่ยนบทบาท / โอนความเป็นเจ้าของ; Editor นำ Member ออกได้แต่นำ Editor/Owner ออกไม่ได้; Member ออกจากทริปได้; Owner ออกไม่ได้ | RLS tests + unit `permissions.test.ts` |
| A9 | ผู้ที่ไม่ใช่สมาชิกอ่าน/เขียนข้อมูลทริปไม่ได้ (trip, roster, submissions, profiles) และหน้าเว็บคืน 404 | RLS tests (cross-trip), manual |
| A10 | Editor แก้ไขทริปได้, Member แก้ไม่ได้ (ฟอร์มเป็น read-only และ DB ไม่ยอม) | RLS test, manual |
| A11 | Owner ลบทริป (ต้องพิมพ์ชื่อยืนยัน) — cascade ข้อมูลทั้งหมด; เก็บถาวร/นำออกได้ | RLS test, manual |
| A12 | หลายทริป: หน้า My Trips + dropdown สลับทริปในหัวหน้าทริป | manual |
| A13 | Realtime: เมื่อเพื่อน join/ถูกนำออก/ทริปถูกแก้ หน้าอื่นที่เปิดอยู่อัปเดตเอง | manual (2 browsers) |
| A14 | Audit log บันทึกการเปลี่ยนแปลง trips/members/selections/hotels/itineraries | RLS test `audit trail recorded` |
| A15 | Mobile: bottom nav Home/Inbox/Map/Plan/Members; Desktop: tabs; Dark/Light toggle | manual |

## Automated tests
```bash
npm test                    # 18 unit tests: permissions, trip validation, invite parsing, open-redirect guard
scripts/test-db.sh          # ~25 RLS/RPC assertions on a real Postgres
npm run typecheck && npm run build
```

## Manual test script (2 accounts)
1. Browser A: สมัคร `alice@…` → สร้างทริป “เชียงใหม่” → Members → คัดลอกลิงก์
2. Browser B (incognito): เปิดลิงก์ → ถูกพาไป login → สมัคร `bob@…` → กลับมาหน้า join → เข้าร่วม
3. Browser A: รายชื่อ Bob ปรากฏเองโดยไม่ต้อง refresh → ตั้ง Bob เป็น Editor
4. Browser B: Settings แก้ชื่อทริป → Browser A เห็นชื่อใหม่
5. Browser B: เปิด `/trips/<id อื่นที่ไม่ได้เป็นสมาชิก>` → 404
6. Browser A: Regenerate code → ลิงก์เก่าใช้ไม่ได้
7. Browser A: Settings → Delete (พิมพ์ชื่อ) → ทริปหายจากทั้งสองฝั่ง
