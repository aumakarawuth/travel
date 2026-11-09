"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, requireUser } from "@/lib/supabase/server";
import { formDataToObject, tripInputSchema, uuidSchema } from "@/lib/validation/trip";
import { normalizeInviteInput } from "@/lib/invite";
import { dbErrorCode, zodFieldErrors, type ActionResult } from "./result";

export async function createTripAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = tripInputSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return { ok: false, error: "validation", fieldErrors: zodFieldErrors(parsed.error) };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("create_trip", { p: parsed.data });
  if (error) return { ok: false, error: dbErrorCode(error) };
  revalidatePath("/trips");
  redirect(`/trips/${data}`);
}

export async function updateTripAction(tripId: string, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  if (!uuidSchema.safeParse(tripId).success) return { ok: false, error: "generic" };
  const parsed = tripInputSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return { ok: false, error: "validation", fieldErrors: zodFieldErrors(parsed.error) };
  const { supabase } = await requireUser();
  const v = parsed.data;
  const { data, error } = await supabase
    .from("trips")
    .update({
      name: v.name, description: v.description ?? null,
      start_location_name: v.start_location_name ?? null, end_location_name: v.end_location_name ?? null,
      start_date: v.start_date, end_date: v.end_date, budget_total: v.budget_total ?? null, currency: v.currency,
      expected_member_count: v.expected_member_count, travel_mode: v.travel_mode,
      daily_start_time: v.daily_start_time, daily_end_time: v.daily_end_time,
    })
    .eq("id", tripId)
    .select("id");
  if (error) return { ok: false, error: dbErrorCode(error) };
  if (!data?.length) return { ok: false, error: "forbidden" }; // RLS filtered the row
  revalidatePath(`/trips/${tripId}`, "layout");
  return { ok: true };
}

export async function setArchivedAction(tripId: string, archived: boolean): Promise<ActionResult> {
  if (!uuidSchema.safeParse(tripId).success) return { ok: false, error: "generic" };
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("trips").update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", tripId).select("id");
  if (error) return { ok: false, error: dbErrorCode(error) };
  if (!data?.length) return { ok: false, error: "forbidden" };
  revalidatePath("/trips");
  revalidatePath(`/trips/${tripId}`, "layout");
  return { ok: true };
}

export async function deleteTripAction(tripId: string): Promise<ActionResult> {
  if (!uuidSchema.safeParse(tripId).success) return { ok: false, error: "generic" };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("trips").delete().eq("id", tripId).select("id");
  if (error) return { ok: false, error: dbErrorCode(error) };
  if (!data?.length) return { ok: false, error: "forbidden" };
  revalidatePath("/trips");
  redirect("/trips");
}

export async function joinTripAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const code = normalizeInviteInput(String(fd.get("code") ?? ""));
  if (!code) return { ok: false, error: "invalid_invite" };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("join_trip", { p_code: code });
  if (error) return { ok: false, error: dbErrorCode(error) };
  revalidatePath("/trips");
  redirect(`/trips/${data}`);
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
