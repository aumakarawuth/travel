"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation/trip";
import { canEditTrip, type TripRole } from "@/lib/permissions";
import { generatePlan, saveManualOrder } from "@/lib/planner/run";
import { cleanText } from "@/lib/metadata/html";
import { log } from "@/lib/log";
import { dbErrorCode, type ActionResult } from "./result";

async function editor(tripId: string) {
  const ctx = await requireUser();
  const { data } = await ctx.supabase.from("trip_members").select("role").eq("trip_id", tripId).eq("user_id", ctx.user.id).maybeSingle();
  return canEditTrip(data?.role as TripRole | undefined) ? ctx : null;
}

const settingsSchema = z.object({
  mealMinutes: z.number().int().min(0).max(180).optional(),
  trafficBufferPct: z.number().int().min(0).max(100).optional(),
  legBufferMinutes: z.number().int().min(0).max(60).optional(),
});

export async function generatePlanAction(tripId: string, settings: z.input<typeof settingsSchema> = {}): Promise<ActionResult<{ version: number }>> {
  const s = settingsSchema.safeParse(settings);
  if (!uuidSchema.safeParse(tripId).success || !s.success) return { ok: false, error: "validation" };
  const ctx = await editor(tripId);
  if (!ctx) return { ok: false, error: "forbidden" };
  // cost guardrail: at most 10 optimisations per trip per hour
  const { count } = await ctx.supabase.from("itinerary_versions").select("id", { count: "exact", head: true })
    .eq("trip_id", tripId).gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
  if ((count ?? 0) >= 30) return { ok: false, error: "rate_limited" };
  try {
    const r = await generatePlan(ctx.supabase, ctx.user.id, tripId, s.data);
    revalidatePath(`/trips/${tripId}`, "layout");
    return { ok: true, data: { version: r.version } };
  } catch (e) {
    log.error("plan_failed", { tripId, e: String(e) });
    return { ok: false, error: dbErrorCode(e as { message?: string }) };
  }
}

const manualSchema = z.object({
  tripId: uuidSchema,
  order: z.record(z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.array(uuidSchema).max(40)),
  lockedDays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(61),
  lockedStops: z.array(uuidSchema).max(400),
});

export async function saveManualPlanAction(input: z.input<typeof manualSchema>): Promise<ActionResult<{ version: number }>> {
  const p = manualSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "validation" };
  const ctx = await editor(p.data.tripId);
  if (!ctx) return { ok: false, error: "forbidden" };
  try {
    const r = await saveManualOrder(ctx.supabase, ctx.user.id, p.data.tripId, p.data.order, p.data.lockedDays, p.data.lockedStops);
    revalidatePath(`/trips/${p.data.tripId}`, "layout");
    return { ok: true, data: { version: r.version } };
  } catch (e) {
    log.error("manual_plan_failed", { e: String(e) });
    return { ok: false, error: dbErrorCode(e as { message?: string }) };
  }
}

export async function activateVersionAction(tripId: string, versionId: string): Promise<ActionResult> {
  if (!uuidSchema.safeParse(tripId).success || !uuidSchema.safeParse(versionId).success) return { ok: false, error: "validation" };
  const ctx = await editor(tripId);
  if (!ctx) return { ok: false, error: "forbidden" };
  await ctx.supabase.from("itinerary_versions").update({ is_active: false }).eq("trip_id", tripId).eq("is_active", true);
  const { data, error } = await ctx.supabase.from("itinerary_versions").update({ is_active: true }).eq("id", versionId).eq("trip_id", tripId).select("id");
  if (error || !data?.length) return { ok: false, error: dbErrorCode(error) };
  revalidatePath(`/trips/${tripId}/plan`);
  return { ok: true };
}

const hotelSchema = z.object({
  tripId: uuidSchema,
  placeId: uuidSchema.optional(),
  name: z.string().trim().min(1).max(200),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pricePerNight: z.number().min(0).max(1e8).optional(),
  rooms: z.number().int().min(1).max(50).default(1),
  status: z.enum(["proposed", "confirmed"]).default("proposed"),
  bookingRef: z.string().max(120).optional(),
}).refine((v) => v.checkOut > v.checkIn, { path: ["checkOut"], message: "end_before_start" });

export async function saveHotelAction(input: z.input<typeof hotelSchema>): Promise<ActionResult> {
  const p = hotelSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message === "end_before_start" ? "end_before_start" : "validation" };
  const v = p.data;
  const { supabase, user } = await requireUser();
  let lat: number | null = null, lng: number | null = null;
  if (v.placeId) {
    // coordinates only from a verified place — never typed or guessed
    const { data: pl } = await supabase.from("places").select("lat,lng,location_verified,trip_id").eq("id", v.placeId).maybeSingle();
    if (!pl || pl.trip_id !== v.tripId) return { ok: false, error: "forbidden" };
    if (pl.location_verified) { lat = pl.lat; lng = pl.lng; }
  }
  const { error } = await supabase.from("accommodations").insert({
    trip_id: v.tripId, place_id: v.placeId ?? null, name: v.name, lat, lng, check_in_date: v.checkIn, check_out_date: v.checkOut,
    price_per_night: v.pricePerNight ?? null, price_source: v.pricePerNight !== undefined ? "user" : null,
    room_count: v.rooms, status: v.status, booking_reference: cleanText(v.bookingRef, 120) ?? null, created_by: user.id, guest_user_ids: [],
  });
  if (error) return { ok: false, error: dbErrorCode(error) };
  revalidatePath(`/trips/${v.tripId}/plan`);
  return { ok: true };
}

export async function setHotelStatusAction(hotelId: string, status: "proposed" | "confirmed"): Promise<ActionResult> {
  if (!uuidSchema.safeParse(hotelId).success || !["proposed", "confirmed"].includes(status)) return { ok: false, error: "validation" };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("accommodations").update({ status }).eq("id", hotelId).select("trip_id");
  if (error) return { ok: false, error: dbErrorCode(error) };
  if (!data?.length) return { ok: false, error: "forbidden" };
  revalidatePath(`/trips/${data[0].trip_id}/plan`);
  return { ok: true };
}

export async function deleteHotelAction(hotelId: string): Promise<ActionResult> {
  if (!uuidSchema.safeParse(hotelId).success) return { ok: false, error: "validation" };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("accommodations").delete().eq("id", hotelId).select("trip_id");
  if (error) return { ok: false, error: dbErrorCode(error) };
  if (!data?.length) return { ok: false, error: "forbidden" };
  revalidatePath(`/trips/${data[0].trip_id}/plan`);
  return { ok: true };
}
