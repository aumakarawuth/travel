"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import { ROLES, uuidSchema } from "@/lib/validation/trip";
import { dbErrorCode, type ActionResult } from "./result";

const ids = z.object({ tripId: uuidSchema, userId: uuidSchema });

export async function setRoleAction(tripId: string, userId: string, role: (typeof ROLES)[number]): Promise<ActionResult> {
  if (!ids.safeParse({ tripId, userId }).success || !ROLES.includes(role)) return { ok: false, error: "generic" };
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("set_member_role", { p_trip: tripId, p_user: userId, p_role: role });
  if (error) return { ok: false, error: dbErrorCode(error) };
  revalidatePath(`/trips/${tripId}`, "layout");
  return { ok: true };
}

export async function removeMemberAction(tripId: string, userId: string): Promise<ActionResult> {
  if (!ids.safeParse({ tripId, userId }).success) return { ok: false, error: "generic" };
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("remove_member", { p_trip: tripId, p_user: userId });
  if (error) return { ok: false, error: dbErrorCode(error) };
  revalidatePath(`/trips/${tripId}/members`);
  return { ok: true };
}

export async function leaveTripAction(tripId: string): Promise<ActionResult> {
  if (!uuidSchema.safeParse(tripId).success) return { ok: false, error: "generic" };
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase.from("trip_members").delete().eq("trip_id", tripId).eq("user_id", user.id).select("user_id");
  if (error) return { ok: false, error: dbErrorCode(error) };
  if (!data?.length) return { ok: false, error: "forbidden" };
  revalidatePath("/trips");
  redirect("/trips");
}

export async function regenerateCodeAction(tripId: string): Promise<ActionResult<string>> {
  if (!uuidSchema.safeParse(tripId).success) return { ok: false, error: "generic" };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("regenerate_invite_code", { p_trip: tripId });
  if (error) return { ok: false, error: dbErrorCode(error) };
  revalidatePath(`/trips/${tripId}/members`);
  return { ok: true, data: data as string };
}

export async function setInviteEnabledAction(tripId: string, enabled: boolean): Promise<ActionResult> {
  if (!uuidSchema.safeParse(tripId).success) return { ok: false, error: "generic" };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("trips").update({ invite_enabled: enabled }).eq("id", tripId).select("id");
  if (error) return { ok: false, error: dbErrorCode(error) };
  if (!data?.length) return { ok: false, error: "forbidden" };
  revalidatePath(`/trips/${tripId}/members`);
  return { ok: true };
}
