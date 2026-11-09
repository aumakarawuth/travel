import type { ExtractionResult } from "@/lib/ai/schema";
import type { PlaceCandidate } from "@/lib/places/google-places";

export type SubmissionView = {
  id: string; originalUrl: string; resolvedUrl: string | null; platform: string; status: "pending" | "analyzing" | "needs_review" | "completed" | "failed";
  note: string | null; error: string | null; submittedAt: string; mine: boolean;
  submitter: { id: string; name: string; color: string; avatar: string | null };
  meta: { extraction?: ExtractionResult; candidates?: PlaceCandidate[]; title?: string; blockedByPlatform?: boolean; fetchError?: string; placeId?: string; placesConfigured?: boolean };
};
