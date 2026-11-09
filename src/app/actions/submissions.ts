"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import { checkUrl, detectPlatform, normalizeUrl } from "@/lib/url/normalize";
import { uuidSchema } from "@/lib/validation/trip";
import { processSubmission } from "@/lib/pipeline/process";
import { savePlaceForSubmission } from "@/lib/pipeline/save-place";
import { placesAvailable, searchPlaces, type PlaceCandidate } from "@/lib/places/google-places";
import { CATEGORIES } from "@/lib/ai/schema";
import { cleanText } from "@/lib/metadata/html";
import { dbErrorCode, type ActionResult } from "./result";

const PER_MINUTE = Number(process.env.LINK_SUBMISSIONS_PER_MINUTE ?? 10);

export async function submitLinkAction(tripId: string, raw: string, note?: string, channel: "paste" | "share_target" = "paste"):
  Promise<ActionResult<{ id: string; duplicate: boolean }>> {
  if (!uuidSchema.safeParse(tripId).success) return { ok: false, error: "generic" };
  const check = checkUrl(String(raw ?? ""));
  if (!check.ok) return { ok: false, error: `url_${check.reason}` };
  const { supabase, user } = await requireUser();

  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await supabase.from("link_submissions").select("id", { count: "exact", head: true })
    .eq("submitted_by", user.id).gte("submitted_at", since);
  if ((count ?? 0) >= PER_MINUTE) return { ok: false, error: "rate_limited" };

  const normalized = normalizeUrl(check.url);
  const { data, error } = await supabase.from("link_submissions").insert({
    trip_id: tripId, submitted_by: user.id, original_url: check.url.toString(), normalized_url: normalized,
    platform: detectPlatform(check.url), share_channel: channel, user_note: cleanText(note, 2000) ?? null,
  }).select("id").single();

  if (error?.code === "23505") {
    const { data: ex } = await supabase.from("link_submissions").select("id").eq("trip_id", tripId)
      .eq("submitted_by", user.id).eq("normalized_url", normalized).single();
    return { ok: true, data: { id: ex!.id, duplicate: true } };
  }
  if (error) return { ok: false, error: dbErrorCode(error) };

  after(() => processSubmission(supabase, user.id, data.id, 0));
  revalidatePath(`/trips/${tripId}/inbox`);
  return { ok: true, data: { id: data.id, duplicate: false } };
}

export async function retrySubmissionAction(submissionId: string): Promise<ActionResult> {
  if (!uuidSchema.safeParse(submissionId).success) return { ok: false, error: "generic" };
  const { supabase, user } = await requireUser();
  const { data: sub } = await supabase.from("link_submissions").select("trip_id").eq("id", submissionId).single();
  if (!sub) return { ok: false, error: "forbidden" };
  const { count } = await supabase.from("ai_extraction_jobs").select("id", { count: "exact", head: true }).eq("submission_id", submissionId);
  if ((count ?? 0) >= 5) return { ok: false, error: "rate_limited" };
  await supabase.from("link_submissions").update({ status: "pending", error_message: null }).eq("id", submissionId);
  after(() => processSubmission(supabase, user.id, submissionId, count ?? 1));
  revalidatePath(`/trips/${sub.trip_id}/inbox`);
  return { ok: true };
}

export async function deleteSubmissionAction(submissionId: string): Promise<ActionResult> {
  if (!uuidSchema.safeParse(submissionId).success) return { ok: false, error: "generic" };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("link_submissions").delete().eq("id", submissionId).select("trip_id");
  if (error) return { ok: false, error: dbErrorCode(error) };
  if (!data?.length) return { ok: false, error: "forbidden" };
  revalidatePath(`/trips/${data[0].trip_id}/inbox`);
  return { ok: true };
}

export async function searchPlacesAction(query: string): Promise<ActionResult<{ available: boolean; candidates: PlaceCandidate[] }>> {
  await requireUser();
  const q = String(query ?? "").trim().slice(0, 200);
  if (!placesAvailable()) return { ok: true, data: { available: false, candidates: [] } };
  if (q.length < 2) return { ok: true, data: { available: true, candidates: [] } };
  try {
    return { ok: true, data: { available: true, candidates: await searchPlaces(q) } };
  } catch {
    return { ok: false, error: "generic" };
  }
}

const reviewSchema = z.object({
  submissionId: uuidSchema,
  name: z.string().trim().min(1).max(200),
  category: z.enum(CATEGORIES),
  description: z.string().trim().max(1000).optional(),
  address: z.string().trim().max(300).optional(),
  candidate: z.object({
    googlePlaceId: z.string().min(5).max(300), name: z.string().max(200), address: z.string().max(300).optional(),
    lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), openingHours: z.array(z.string()).optional(),
    openingPeriods: z.array(z.object({ open: z.object({ day: z.number(), hour: z.number(), minute: z.number() }), close: z.object({ day: z.number(), hour: z.number(), minute: z.number() }).optional() })).max(30).optional(),
  }).optional(),
  useExtractedLocation: z.boolean().default(false),
  visitMinutes: z.number().int().min(5).max(1440).optional(),
});

/** User confirms a Needs-Review item. Location comes ONLY from a chosen Places candidate or the evidence-backed extraction. */
export async function confirmReviewAction(input: z.input<typeof reviewSchema>): Promise<ActionResult<{ placeId: string; merged: boolean }>> {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "validation" };
  const v = parsed.data;
  const { supabase, user } = await requireUser();
  const { data: sub } = await supabase.from("link_submissions").select("id,trip_id,metadata,resolved_url,original_url").eq("id", v.submissionId).single();
  if (!sub) return { ok: false, error: "forbidden" };
  const ex = (sub.metadata as { extraction?: Record<string, unknown> })?.extraction ?? {};

  let lat: number | undefined, lng: number | undefined, googlePlaceId: string | undefined, verified = false, address = v.address;
  let openingHours: unknown;
  if (v.candidate) {
    ({ lat, lng, googlePlaceId } = v.candidate);
    address = v.candidate.address ?? address;
    verified = true;
    if (v.candidate.openingHours?.length) openingHours = { weekdayText: v.candidate.openingHours, periods: v.candidate.openingPeriods ?? null, source: "google_places", checkedAt: new Date().toISOString() };
  } else if (v.useExtractedLocation && typeof ex.latitude === "number" && typeof ex.longitude === "number") {
    lat = ex.latitude; lng = ex.longitude; googlePlaceId = ex.googlePlaceId as string | undefined;
    verified = true; // user explicitly confirmed the evidence-derived pin
  }

  try {
    const res = await savePlaceForSubmission(supabase, user.id, sub.trip_id, sub.id, {
      name: v.name, category: v.category, description: v.description, address, lat, lng, googlePlaceId,
      locationVerified: verified, openingHours, visitMinutes: v.visitMinutes,
      estimatedPrice: ex.estimatedPrice as number | undefined, currency: ex.currency as string | undefined, priceSource: ex.priceSource as string | undefined,
      images: (ex.images as { url: string; source: string }[] | undefined) ?? [], confidence: 1,
      evidence: [
        ...((ex.sourceEvidence as { sourceType: string; url: string; fields: Record<string, unknown> }[] | undefined) ?? []),
        { sourceType: "user", url: sub.resolved_url ?? sub.original_url, fields: { confirmedBy: user.id, candidate: v.candidate?.googlePlaceId ?? null } },
      ],
    });
    await supabase.from("link_submissions").update({ status: "completed", error_message: null, metadata: { ...(sub.metadata as object), placeId: res.placeId } }).eq("id", sub.id);
    revalidatePath(`/trips/${sub.trip_id}/inbox`);
    return { ok: true, data: res };
  } catch (e) {
    return { ok: false, error: dbErrorCode(e as { message?: string; code?: string }) };
  }
}
