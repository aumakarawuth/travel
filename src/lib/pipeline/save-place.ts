import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Category } from "@/lib/ai/schema";
import { findDuplicate, normalizeName, type DedupePlace } from "./dedupe";

export type PlaceInput = {
  name: string; category: Category; placeType?: string; description?: string; address?: string;
  lat?: number; lng?: number; googlePlaceId?: string; locationVerified: boolean;
  estimatedPrice?: number; currency?: string; priceSource?: string;
  openingHours?: unknown; visitMinutes?: number; images: { url: string; source: string }[];
  confidence: number; evidence: { sourceType: string; url: string; fields: Record<string, unknown> }[];
};

const SOURCE_TYPE: Record<string, string> = { open_graph: "open_graph", oembed: "oembed", google_maps_url: "official_api", google_places: "google_places", ai: "ai", user: "user" };

/**
 * Create or reuse a place for the trip and link the submission to it.
 * Existing places are never overwritten with weaker data — only empty fields are filled.
 */
export async function savePlaceForSubmission(
  supabase: SupabaseClient, userId: string, tripId: string, submissionId: string, p: PlaceInput,
): Promise<{ placeId: string; merged: boolean }> {
  const { data: existing, error: e1 } = await supabase
    .from("places").select("id,name_normalized,google_place_id,lat,lng").eq("trip_id", tripId).returns<DedupePlace[]>();
  if (e1) throw e1;
  const dup = findDuplicate({ name: p.name, googlePlaceId: p.googlePlaceId, lat: p.lat, lng: p.lng }, existing ?? []);

  let placeId: string;
  if (dup) {
    placeId = dup.id;
    const fill: Record<string, unknown> = {};
    if (dup.lat === null && p.lat !== undefined && p.locationVerified) Object.assign(fill, { lat: p.lat, lng: p.lng, location_verified: true });
    if (!dup.google_place_id && p.googlePlaceId) fill.google_place_id = p.googlePlaceId;
    if (Object.keys(fill).length) await supabase.from("places").update(fill).eq("id", placeId);
  } else {
    const { data, error } = await supabase.from("places").insert({
      trip_id: tripId, created_by: userId,
      name: p.name.slice(0, 200), name_normalized: normalizeName(p.name) || p.name.toLowerCase(),
      category: p.category, place_type: p.placeType ?? null, description: p.description ?? null, address: p.address ?? null,
      lat: p.lat ?? null, lng: p.lng ?? null, google_place_id: p.googlePlaceId ?? null, location_verified: p.locationVerified,
      estimated_price: p.estimatedPrice ?? null, currency: p.estimatedPrice !== undefined ? p.currency ?? "THB" : null,
      price_source: p.priceSource ?? null, price_checked_at: p.estimatedPrice !== undefined ? new Date().toISOString() : null,
      opening_hours: p.openingHours ?? null,
      opening_hours_source: p.openingHours ? "google_places" : null,
      opening_hours_checked_at: p.openingHours ? new Date().toISOString() : null,
      visit_duration_minutes: p.visitMinutes ?? null, images: p.images, confidence: p.confidence,
      needs_review: !p.locationVerified,
    }).select("id").single();
    if (error) {
      // lost a race on the unique google_place_id index → reuse the winner
      if (error.code === "23505" && p.googlePlaceId) {
        const { data: w } = await supabase.from("places").select("id").eq("trip_id", tripId).eq("google_place_id", p.googlePlaceId).single();
        if (!w) throw error;
        placeId = w.id;
      } else throw error;
    } else placeId = data.id;
    await supabase.from("trip_place_selections").upsert({ trip_id: tripId, place_id: placeId!, status: "proposed", updated_by: userId }, { onConflict: "trip_id,place_id", ignoreDuplicates: true });
  }

  const { data: sub } = await supabase.from("link_submissions").select("submitted_by").eq("id", submissionId).single();
  await supabase.from("place_submissions").upsert(
    { place_id: placeId, submission_id: submissionId, trip_id: tripId, submitted_by: sub?.submitted_by ?? userId },
    { onConflict: "place_id,submission_id", ignoreDuplicates: true },
  );
  if (p.evidence.length) {
    await supabase.from("place_sources").delete().eq("submission_id", submissionId).eq("place_id", placeId);
    await supabase.from("place_sources").insert(p.evidence.map((e) => ({
      trip_id: tripId, place_id: placeId, submission_id: submissionId,
      source_type: SOURCE_TYPE[e.sourceType] ?? "user", url: e.url, evidence: e.fields,
    })));
  }
  return { placeId, merged: Boolean(dup) };
}
