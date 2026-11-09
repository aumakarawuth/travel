import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExplorePlace, Person } from "@/lib/explore";

type Row = {
  id: string; name: string; category: ExplorePlace["category"]; description: string | null; address: string | null;
  lat: number | null; lng: number | null; location_verified: boolean; google_place_id: string | null;
  estimated_price: number | null; currency: string | null; images: { url: string; source: string }[];
  trip_place_selections: { status: ExplorePlace["status"]; priority: ExplorePlace["priority"]; note: string | null }[];
  place_submissions: { profile: { id: string; display_name: string; color: string; avatar_url: string | null } | null; submission: { original_url: string } | null }[];
  place_votes: { user_id: string; vote: ExplorePlace["votes"][number]["vote"] }[];
  place_comments: { id: string; deleted_at: string | null }[];
};

export async function loadExplorePlaces(supabase: SupabaseClient, tripId: string): Promise<ExplorePlace[]> {
  const { data, error } = await supabase.from("places")
    .select(`id,name,category,description,address,lat,lng,location_verified,google_place_id,estimated_price,currency,images,
      trip_place_selections(status,priority,note),
      place_submissions(profile:profiles(id,display_name,color,avatar_url),submission:link_submissions(original_url)),
      place_votes(user_id,vote),
      place_comments(id,deleted_at)`)
    .eq("trip_id", tripId).order("created_at").returns<Row[]>();
  if (error) throw error;
  return (data ?? []).map((r) => {
    const sel = r.trip_place_selections[0];
    const people = new Map<string, Person>();
    for (const s of r.place_submissions) if (s.profile) people.set(s.profile.id, { id: s.profile.id, name: s.profile.display_name, color: s.profile.color, avatar: s.profile.avatar_url });
    return {
      id: r.id, name: r.name, category: r.category, description: r.description, address: r.address,
      lat: r.lat, lng: r.lng, locationVerified: r.location_verified, googlePlaceId: r.google_place_id,
      price: r.estimated_price, currency: r.currency, image: r.images?.[0] ?? null,
      status: sel?.status ?? "proposed", priority: sel?.priority ?? "normal", note: sel?.note ?? null,
      submitters: [...people.values()],
      sourceUrls: [...new Set(r.place_submissions.map((s) => s.submission?.original_url).filter((u): u is string => Boolean(u)))],
      votes: r.place_votes.map((v) => ({ userId: v.user_id, vote: v.vote })),
      commentCount: r.place_comments.filter((c) => !c.deleted_at).length,
    };
  });
}
