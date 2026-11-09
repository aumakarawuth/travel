"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation/trip";
import { cleanText } from "@/lib/metadata/html";
import { dbErrorCode, type ActionResult } from "./result";

async function placeTrip(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], placeId: string) {
  const { data } = await supabase.from("places").select("trip_id").eq("id", placeId).maybeSingle();
  return data?.trip_id as string | undefined;
}
const touch = (tripId: string, placeId: string) => {
  revalidatePath(`/trips/${tripId}/map`);
  revalidatePath(`/trips/${tripId}/places/${placeId}`);
};

/** Upsert the caller's vote; sending the same vote again clears it (toggle). Never touches other data. */
export async function voteAction(placeId: string, vote: "want" | "maybe" | "not_interested"): Promise<ActionResult> {
  if (!uuidSchema.safeParse(placeId).success || !["want", "maybe", "not_interested"].includes(vote)) return { ok: false, error: "validation" };
  const { supabase, user } = await requireUser();
  const tripId = await placeTrip(supabase, placeId);
  if (!tripId) return { ok: false, error: "forbidden" };
  const { data: cur } = await supabase.from("place_votes").select("vote").eq("place_id", placeId).eq("user_id", user.id).maybeSingle();
  const { error } = cur?.vote === vote
    ? await supabase.from("place_votes").delete().eq("place_id", placeId).eq("user_id", user.id)
    : await supabase.from("place_votes").upsert({ trip_id: tripId, place_id: placeId, user_id: user.id, vote, updated_at: new Date().toISOString() }, { onConflict: "place_id,user_id" });
  if (error) return { ok: false, error: dbErrorCode(error) };
  touch(tripId, placeId);
  return { ok: true };
}

const selectionSchema = z.object({
  placeId: uuidSchema,
  status: z.enum(["proposed", "shortlisted", "selected", "rejected"]).optional(),
  priority: z.enum(["must_visit", "high", "normal", "optional"]).optional(),
  note: z.string().max(2000).optional(),
});

/** Owner/editor only (RLS). "scheduled" is set by the planner, not by hand. */
export async function updateSelectionAction(input: z.input<typeof selectionSchema>): Promise<ActionResult> {
  const p = selectionSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "validation" };
  const { supabase, user } = await requireUser();
  const tripId = await placeTrip(supabase, p.data.placeId);
  if (!tripId) return { ok: false, error: "forbidden" };
  const patch: Record<string, unknown> = { trip_id: tripId, place_id: p.data.placeId, updated_by: user.id };
  if (p.data.status) patch.status = p.data.status;
  if (p.data.priority) patch.priority = p.data.priority;
  if (p.data.note !== undefined) patch.note = cleanText(p.data.note, 2000) ?? null;
  const { data, error } = await supabase.from("trip_place_selections").upsert(patch, { onConflict: "trip_id,place_id" }).select("place_id");
  if (error) return { ok: false, error: dbErrorCode(error) };
  if (!data?.length) return { ok: false, error: "forbidden" };
  touch(tripId, p.data.placeId);
  return { ok: true };
}

export async function addCommentAction(placeId: string, body: string): Promise<ActionResult> {
  const text = cleanText(body, 2000);
  if (!uuidSchema.safeParse(placeId).success || !text) return { ok: false, error: "validation" };
  const { supabase, user } = await requireUser();
  const tripId = await placeTrip(supabase, placeId);
  if (!tripId) return { ok: false, error: "forbidden" };
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await supabase.from("place_comments").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", since);
  if ((count ?? 0) >= 20) return { ok: false, error: "rate_limited" };
  const { error } = await supabase.from("place_comments").insert({ trip_id: tripId, place_id: placeId, user_id: user.id, body: text });
  if (error) return { ok: false, error: dbErrorCode(error) };
  touch(tripId, placeId);
  return { ok: true };
}

/** Soft delete keeps history (spec: never destroy data on collaboration changes). */
export async function deleteCommentAction(commentId: string): Promise<ActionResult> {
  if (!uuidSchema.safeParse(commentId).success) return { ok: false, error: "validation" };
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase.from("place_comments").update({ deleted_at: new Date().toISOString() })
    .eq("id", commentId).eq("user_id", user.id).select("trip_id,place_id");
  if (error) return { ok: false, error: dbErrorCode(error) };
  if (!data?.length) return { ok: false, error: "forbidden" };
  touch(data[0].trip_id, data[0].place_id);
  return { ok: true };
}
