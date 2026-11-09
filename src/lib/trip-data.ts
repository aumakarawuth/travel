import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { TRIP_COLUMNS, type MemberRow, type Trip } from "@/lib/types";
import type { TripRole } from "@/lib/permissions";
import { uuidSchema } from "@/lib/validation/trip";

/** Loads a trip the current user is a member of. RLS returns nothing otherwise → 404 (no existence leak). */
export const getTripContext = cache(async (tripId: string) => {
  if (!uuidSchema.safeParse(tripId).success) notFound();
  const { supabase, user } = await requireUser(`/trips/${tripId}`);
  const [{ data: trip }, { data: members }] = await Promise.all([
    supabase.from("trips").select(TRIP_COLUMNS).eq("id", tripId).maybeSingle<Trip>(),
    supabase
      .from("trip_members")
      .select("trip_id,user_id,role,color,joined_at,profile:profiles(id,display_name,avatar_url,color,locale)")
      .eq("trip_id", tripId)
      .order("joined_at")
      .returns<MemberRow[]>(),
  ]);
  if (!trip) notFound();
  const me = members?.find((m) => m.user_id === user.id);
  if (!me) notFound();
  return { supabase, user, trip, members: members ?? [], role: me.role as TripRole };
});
