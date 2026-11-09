import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchLinkMetadata } from "@/lib/metadata/fetch-metadata";
import { getAiProvider, MockProvider, type AiOutput } from "@/lib/ai/provider";
import { placesAvailable, searchPlaces, type PlaceCandidate } from "@/lib/places/google-places";
import { SafeFetchError } from "@/lib/url/safe-fetch";
import { decide } from "./decide";
import { savePlaceForSubmission } from "./save-place";
import { log } from "@/lib/log";

const AI_PER_USER_DAY = Number(process.env.AI_MAX_JOBS_PER_USER_PER_DAY ?? 50);
const AI_PER_TRIP_DAY = Number(process.env.AI_MAX_JOBS_PER_TRIP_PER_DAY ?? 200);

function evidenceToText(meta: Awaited<ReturnType<typeof fetchLinkMetadata>>, note?: string | null) {
  const lines: string[] = [];
  if (meta.page?.title) lines.push(`title: ${meta.page.title}`);
  if (meta.page?.siteName) lines.push(`site: ${meta.page.siteName}`);
  if (meta.page?.jsonLdNames.length) lines.push(`structured place names: ${meta.page.jsonLdNames.join(" | ")}`);
  if (meta.page?.address) lines.push(`address: ${meta.page.address}`);
  if (meta.page?.description) lines.push(`description: ${meta.page.description}`);
  if (meta.oembed?.title) lines.push(`video caption: ${meta.oembed.title}`);
  if (meta.oembed?.author) lines.push(`author: ${meta.oembed.author}`);
  if (meta.maps?.name) lines.push(`name: ${meta.maps.name} (from Google Maps URL)`);
  if (note) lines.push(`user note: ${note}`);
  return lines.join("\n");
}

/**
 * Idempotent: the job row is keyed by `${submissionId}:${attempt}`; re-running a finished
 * attempt is a no-op, and all writes are upserts. Errors mark the job/submission failed.
 */
export async function processSubmission(supabase: SupabaseClient, userId: string, submissionId: string, attempt = 0) {
  const { data: sub, error } = await supabase
    .from("link_submissions").select("id,trip_id,original_url,user_note,status,submitted_by").eq("id", submissionId).single();
  if (error || !sub) return;
  const key = `${submissionId}:${attempt}`;

  const { data: job } = await supabase.from("ai_extraction_jobs")
    .upsert({ trip_id: sub.trip_id, submission_id: sub.id, requested_by: userId, idempotency_key: key }, { onConflict: "idempotency_key", ignoreDuplicates: true })
    .select("id").maybeSingle();
  if (!job) return; // another invocation owns this attempt

  const started = Date.now();
  await supabase.from("ai_extraction_jobs").update({ status: "running", attempts: 1, locked_at: new Date().toISOString() }).eq("id", job.id);
  await supabase.from("link_submissions").update({ status: "analyzing", error_message: null }).eq("id", sub.id);

  try {
    const meta = await fetchLinkMetadata(sub.original_url);
    const evidenceText = evidenceToText(meta, sub.user_note);

    // cost guardrails: daily AI budget per user and per trip
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const [{ count: userJobs }, { count: tripJobs }] = await Promise.all([
      supabase.from("ai_extraction_jobs").select("id", { count: "exact", head: true }).eq("requested_by", userId).gte("created_at", since).not("provider", "is", null).neq("provider", "mock"),
      supabase.from("ai_extraction_jobs").select("id", { count: "exact", head: true }).eq("trip_id", sub.trip_id).gte("created_at", since).not("provider", "is", null).neq("provider", "mock"),
    ]);
    const overQuota = (userJobs ?? 0) >= AI_PER_USER_DAY || (tripJobs ?? 0) >= AI_PER_TRIP_DAY;

    let ai: AiOutput | null = null;
    if (evidenceText.trim()) {
      const provider = overQuota ? new MockProvider() : getAiProvider();
      ai = await provider.extract({ platform: meta.platform, url: meta.resolvedUrl, evidenceText, userNote: sub.user_note ?? undefined });
    }

    let candidates: PlaceCandidate[] = [];
    const query = meta.maps?.name ?? ai?.data.placeName;
    if (query && placesAvailable()) {
      const q = [query, ai?.data.city].filter(Boolean).join(" ");
      const bias = meta.maps?.lat !== undefined ? { lat: meta.maps.lat, lng: meta.maps.lng! } : undefined;
      candidates = await searchPlaces(q, bias).catch((e) => { log.warn("places_failed", { e: String(e) }); return []; });
    }

    const result = decide({
      originalUrl: sub.original_url, resolvedUrl: meta.resolvedUrl, platform: meta.platform,
      evidenceText, evidence: [
        ...meta.evidence,
        ...(ai ? [{ sourceType: "ai", url: meta.resolvedUrl, fields: { provider: ai.provider, model: ai.model, mock: ai.isMock, reasoning: ai.data.reasoning } }] : []),
        ...(candidates.length ? [{ sourceType: "google_places", url: "places.googleapis.com", fields: { candidates: candidates.length } }] : []),
      ],
      image: meta.oembed?.thumbnail ? { url: meta.oembed.thumbnail, source: `${meta.oembed.provider ?? meta.platform} oEmbed` }
        : meta.page?.image ? { url: meta.page.image, source: `${meta.page.siteName ?? meta.platform} og:image` } : undefined,
      maps: meta.maps,
      pageGeo: meta.page?.lat !== undefined && meta.page.lng !== undefined ? { lat: meta.page.lat, lng: meta.page.lng } : undefined,
      ai: ai?.data ?? null, aiProvider: ai?.provider ?? "none", isMock: ai?.isMock ?? false,
      candidates, placesChecked: placesAvailable(), now: new Date(),
    });

    const metadata = {
      extraction: result,
      candidates,
      fetchError: meta.fetchError,
      blockedByPlatform: meta.blockedByPlatform,
      overQuota,
      placesConfigured: placesAvailable(),
      title: meta.oembed?.title ?? meta.page?.title,
    };

    let placeId: string | undefined;
    if (result.extractionStatus === "completed" && result.placeName) {
      ({ placeId } = await savePlaceForSubmission(supabase, userId, sub.trip_id, sub.id, {
        name: result.placeName, category: result.category, placeType: result.placeType, description: result.description,
        address: result.address, lat: result.latitude, lng: result.longitude, googlePlaceId: result.googlePlaceId,
        locationVerified: true, estimatedPrice: result.estimatedPrice, currency: result.currency, priceSource: result.priceSource,
        openingHours: result.openingHours, visitMinutes: result.suggestedVisitDurationMinutes, images: result.images,
        confidence: result.confidenceScore, evidence: result.sourceEvidence,
      }));
    }

    await supabase.from("link_submissions").update({
      status: result.extractionStatus, resolved_url: meta.resolvedUrl, platform: meta.platform,
      metadata: { ...metadata, placeId },
    }).eq("id", sub.id);
    await supabase.from("ai_extraction_jobs").update({
      status: "succeeded", provider: ai?.provider ?? "none", model: ai?.model ?? null,
      input_tokens: ai?.inputTokens ?? null, output_tokens: ai?.outputTokens ?? null, result: result, last_error: null,
    }).eq("id", job.id);
    log.info("submission_processed", { submissionId, status: result.extractionStatus, ms: Date.now() - started, provider: ai?.provider });
  } catch (e) {
    const code = e instanceof SafeFetchError ? e.code : e instanceof Error ? e.message.slice(0, 80) : "unknown";
    log.error("submission_failed", { submissionId, code });
    const userMsg = e instanceof SafeFetchError && (e.code === "blocked_url" || e.code === "blocked_ip")
      ? "blocked_unsafe_url" : code;
    await supabase.from("link_submissions").update({ status: e instanceof SafeFetchError && e.code.startsWith("blocked") ? "failed" : "needs_review", error_message: userMsg }).eq("id", sub.id);
    await supabase.from("ai_extraction_jobs").update({ status: "failed", last_error: code }).eq("id", job.id);
  }
}
