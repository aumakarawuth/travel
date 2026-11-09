import { z } from "zod";

export const TRAVEL_MODES = ["car", "motorbike", "public_transit", "walking", "bicycle", "mixed"] as const;
export const ROLES = ["owner", "editor", "member"] as const;

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "invalid_time").transform((t) => t.slice(0, 5));
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalid_date");
const optText = (max: number) =>
  z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));
const optNum = (schema: z.ZodNumber) =>
  z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : Number(v)), schema.optional());

export const tripInputSchema = z
  .object({
    name: z.string().trim().min(1, "required").max(120),
    description: optText(2000),
    start_location_name: optText(200),
    end_location_name: optText(200),
    start_date: isoDate,
    end_date: isoDate,
    budget_total: optNum(z.number().min(0).max(1e10)),
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default("THB"),
    expected_member_count: optNum(z.number().int().min(1).max(100)).transform((v) => v ?? 1),
    travel_mode: z.enum(TRAVEL_MODES).default("car"),
    daily_start_time: time.default("09:00"),
    daily_end_time: time.default("20:00"),
  })
  .superRefine((v, ctx) => {
    if (v.end_date < v.start_date) {
      ctx.addIssue({ code: "custom", path: ["end_date"], message: "end_before_start" });
    } else {
      const days = (Date.parse(v.end_date) - Date.parse(v.start_date)) / 86_400_000;
      if (days > 60) ctx.addIssue({ code: "custom", path: ["end_date"], message: "trip_too_long" });
    }
    if (v.daily_end_time <= v.daily_start_time) {
      ctx.addIssue({ code: "custom", path: ["daily_end_time"], message: "end_time_before_start" });
    }
  });

export type TripInput = z.infer<typeof tripInputSchema>;

export const profileInputSchema = z.object({
  display_name: z.string().trim().min(1).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  locale: z.enum(["th", "en"]).default("th"),
});

export const uuidSchema = z.string().uuid();

export function formDataToObject(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  fd.forEach((v, k) => {
    if (typeof v === "string") out[k] = v;
  });
  return out;
}

export function dayCount(start: string, end: string): number {
  return Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
}
