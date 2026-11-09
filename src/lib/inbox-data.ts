import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SubmissionView } from "@/components/inbox/types";

type Row = {
  id: string; original_url: string; resolved_url: string | null; platform: string; status: SubmissionView["status"];
  user_note: string | null; error_message: string | null; submitted_at: string; metadata: SubmissionView["meta"];
  submitter: { id: string; display_name: string; color: string; avatar_url: string | null } | null;
};

export async function loadSubmissions(supabase: SupabaseClient, tripId: string, me: string): Promise<SubmissionView[]> {
  const { data } = await supabase.from("link_submissions")
    .select("id,original_url,resolved_url,platform,status,user_note,error_message,submitted_at,metadata,submitter:profiles!link_submissions_submitted_by_fkey(id,display_name,color,avatar_url)")
    .eq("trip_id", tripId).order("submitted_at", { ascending: false }).limit(200).returns<Row[]>();
  return (data ?? []).map((r) => ({
    id: r.id, originalUrl: r.original_url, resolvedUrl: r.resolved_url, platform: r.platform, status: r.status,
    note: r.user_note, error: r.error_message, submittedAt: r.submitted_at, mine: r.submitter?.id === me, meta: r.metadata ?? {},
    submitter: { id: r.submitter?.id ?? "", name: r.submitter?.display_name ?? "?", color: r.submitter?.color ?? "#64748b", avatar: r.submitter?.avatar_url ?? null },
  }));
}

export type PlaceRow = {
  id: string; name: string; category: string; address: string | null; lat: number | null; lng: number | null;
  location_verified: boolean; images: { url: string; source: string }[];
  place_submissions: { submitted_by: string; profile: { display_name: string; color: string } | null }[];
};

export async function loadPlaces(supabase: SupabaseClient, tripId: string): Promise<PlaceRow[]> {
  const { data } = await supabase.from("places")
    .select("id,name,category,address,lat,lng,location_verified,images,place_submissions(submitted_by,profile:profiles(display_name,color))")
    .eq("trip_id", tripId).order("created_at", { ascending: false }).returns<PlaceRow[]>();
  return data ?? [];
}
