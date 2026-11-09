export const th = {
  app: { name: "TripSync AI", tagline: "วางแผนเที่ยวกับเพื่อน ด้วย AI ที่จัดทุกลิงก์ให้เป็นแผน" },
  nav: { home: "หน้าแรก", inbox: "ลิงก์", map: "แผนที่", plan: "แผนเที่ยว", members: "สมาชิก", trips: "ทริปของฉัน", settings: "ตั้งค่า", profile: "โปรไฟล์" },
  auth: {
    login: "เข้าสู่ระบบ", register: "สมัครสมาชิก", email: "อีเมล", password: "รหัสผ่าน", displayName: "ชื่อที่แสดง",
    magicLink: "ส่งลิงก์เข้าสู่ระบบทางอีเมล", magicSent: "ส่งลิงก์ไปที่อีเมลแล้ว กรุณาตรวจสอบกล่องจดหมาย",
    signout: "ออกจากระบบ", noAccount: "ยังไม่มีบัญชี?", haveAccount: "มีบัญชีแล้ว?", checkEmail: "สมัครสำเร็จ กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ",
    or: "หรือ",
  },
  trips: {
    title: "ทริปของฉัน", create: "สร้างทริปใหม่", empty: "ยังไม่มีทริป", emptyHint: "สร้างทริปแรก หรือเข้าร่วมทริปเพื่อนด้วยโค้ดเชิญ",
    join: "เข้าร่วมด้วยโค้ด", joinPlaceholder: "โค้ด 8 หลัก หรือ ลิงก์เชิญ", days: "วัน", members: "สมาชิก", archived: "เก็บถาวร",
  },
  form: {
    name: "ชื่อทริป", description: "รายละเอียด", start: "จุดเริ่มต้น", end: "จุดสิ้นสุด", startDate: "วันเริ่มเดินทาง", endDate: "วันสุดท้าย",
    budget: "งบประมาณรวม", currency: "สกุลเงิน", memberCount: "จำนวนสมาชิก (ประมาณ)", travelMode: "รูปแบบการเดินทาง",
    dailyStart: "เริ่มเที่ยวรายวัน", dailyEnd: "เลิกเที่ยวรายวัน", save: "บันทึก", create: "สร้างทริป", cancel: "ยกเลิก",
    optional: "ไม่บังคับ", more: "ตั้งค่าเพิ่มเติม",
  },
  travelMode: { car: "รถยนต์", motorbike: "มอเตอร์ไซค์", public_transit: "ขนส่งสาธารณะ", walking: "เดิน", bicycle: "จักรยาน", mixed: "ผสม" },
  role: { owner: "เจ้าของ", editor: "ผู้แก้ไข", member: "สมาชิก" },
  members: {
    title: "สมาชิก", invite: "เชิญเพื่อน", inviteCode: "โค้ดเชิญ", copyLink: "คัดลอกลิงก์", copyCode: "คัดลอกโค้ด", share: "แชร์",
    regenerate: "สร้างโค้ดใหม่", regenerateConfirm: "โค้ดและลิงก์เดิมจะใช้ไม่ได้อีก ต้องการสร้างใหม่หรือไม่?",
    inviteDisabled: "ปิดการเชิญอยู่", enableInvite: "เปิดการเชิญ", disableInvite: "ปิดการเชิญ",
    remove: "นำออก", removeConfirm: "ต้องการนำสมาชิกคนนี้ออกจากทริปหรือไม่? ข้อมูลที่เขาเสนอจะยังอยู่",
    leave: "ออกจากทริป", leaveConfirm: "ต้องการออกจากทริปนี้หรือไม่?", makeOwner: "โอนความเป็นเจ้าของ",
    makeOwnerConfirm: "คุณจะกลายเป็นผู้แก้ไข และสมาชิกคนนี้จะเป็นเจ้าของ", you: "คุณ", joined: "เข้าร่วมเมื่อ",
    onlyEditors: "เฉพาะเจ้าของ/ผู้แก้ไขเท่านั้นที่เห็นโค้ดเชิญ",
  },
  join: {
    title: "เข้าร่วมทริป", invalid: "โค้ดเชิญไม่ถูกต้อง หมดอายุ หรือถูกปิดแล้ว", already: "คุณเป็นสมาชิกทริปนี้อยู่แล้ว",
    cta: "เข้าร่วมทริป", open: "เปิดทริป",
  },
  overview: {
    dates: "วันเดินทาง", budget: "งบประมาณ", daily: "เวลาเที่ยวต่อวัน", route: "เส้นทาง", quickAdd: "วางลิงก์สถานที่",
    quickAddSoon: "การวิเคราะห์ลิงก์ด้วย AI จะเปิดใช้งานใน Phase 2", stats: "สรุปทริป", noBudget: "ไม่ได้กำหนด",
  },
  settings: {
    title: "ตั้งค่าทริป", danger: "พื้นที่อันตราย", archive: "เก็บถาวรทริป", unarchive: "นำออกจากที่เก็บถาวร",
    delete: "ลบทริป", deleteConfirm: "ลบทริปและข้อมูลทั้งหมดถาวร ไม่สามารถกู้คืนได้ พิมพ์ชื่อทริปเพื่อยืนยัน",
    readOnly: "คุณมีสิทธิ์ดูอย่างเดียว",
  },
  profile: { title: "โปรไฟล์", color: "สีประจำตัว", language: "ภาษา" },
  phase: { soon: "กำลังพัฒนา", soonBody: "ฟีเจอร์นี้อยู่ในแผน Phase {n} ยังไม่เปิดใช้งาน" },
  common: { loading: "กำลังโหลด…", error: "เกิดข้อผิดพลาด", retry: "ลองใหม่", saved: "บันทึกแล้ว", copied: "คัดลอกแล้ว", confirm: "ยืนยัน", back: "กลับ", offline: "ออฟไลน์" },
  errors: {
    required: "จำเป็นต้องกรอก", end_before_start: "วันสุดท้ายต้องไม่ก่อนวันเริ่ม", trip_too_long: "ทริปยาวได้สูงสุด 61 วัน",
    end_time_before_start: "เวลาเลิกต้องหลังเวลาเริ่ม", invalid_invite: "โค้ดเชิญไม่ถูกต้อง", forbidden: "คุณไม่มีสิทธิ์ทำรายการนี้",
    rate_limited: "ทำรายการถี่เกินไป กรุณาลองใหม่ภายหลัง", generic: "เกิดข้อผิดพลาด กรุณาลองใหม่", trip_full: "ทริปนี้มีสมาชิกเต็มแล้ว",
    invite_email_mismatch: "คำเชิญนี้ออกให้อีเมลอื่น",
  },
} as const;

type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };
export type Dict = Widen<typeof th>;
