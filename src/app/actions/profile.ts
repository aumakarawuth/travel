"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { formDataToObject, profileInputSchema } from "@/lib/validation/trip";
import { dbErrorCode, zodFieldErrors, type ActionResult } from "./result";

export async function updateProfileAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = profileInputSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return { ok: false, error: "validation", fieldErrors: zodFieldErrors(parsed.error) };
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("profiles").update(parsed.data).eq("id", user.id);
  if (error) return { ok: false, error: dbErrorCode(error) };
  (await cookies()).set("locale", parsed.data.locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
  return { ok: true };
}
