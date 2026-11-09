import { z } from "zod";

export const CATEGORIES = [
  "attraction", "cafe", "restaurant", "accommodation", "activity", "nature",
  "shopping", "nightlife", "viewpoint", "transportation", "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

const optStr = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || undefined);

/** What the model is allowed to return. Coordinates are deliberately absent: they come only from evidence/Places. */
export const aiExtractionSchema = z.object({
  placeName: optStr(200),
  alternativeNames: z.array(z.string().max(200)).max(5).nullish().transform((v) => v ?? []),
  placeType: optStr(80),
  category: z.enum(CATEGORIES).catch("other"),
  description: optStr(1000),
  address: optStr(300),
  city: optStr(100),
  estimatedPrice: z.number().nonnegative().nullish().transform((v) => v ?? undefined),
  currency: z.string().regex(/^[A-Z]{3}$/).nullish().transform((v) => v ?? undefined),
  priceEvidenceQuote: optStr(300),
  suggestedVisitDurationMinutes: z.number().int().min(5).max(1440).nullish().transform((v) => v ?? undefined),
  confidenceScore: z.number().min(0).max(1),
  missingFields: z.array(z.string().max(50)).max(20).nullish().transform((v) => v ?? []),
  reasoning: optStr(500),
});
export type AiExtraction = z.infer<typeof aiExtractionSchema>;

/** JSON Schema handed to providers that support structured output. */
export const aiExtractionJsonSchema = {
  type: "object",
  properties: {
    placeName: { type: "string", description: "Exact name of ONE physical place, only if stated in the evidence. Empty if unknown." },
    alternativeNames: { type: "array", items: { type: "string" } },
    placeType: { type: "string" },
    category: { type: "string", enum: [...CATEGORIES] },
    description: { type: "string", description: "1-2 sentence Thai summary based only on evidence" },
    address: { type: "string", description: "Only if present in evidence" },
    city: { type: "string" },
    estimatedPrice: { type: "number", description: "Only if a price literally appears in evidence" },
    currency: { type: "string" },
    priceEvidenceQuote: { type: "string", description: "Exact substring of the evidence that contains the price" },
    suggestedVisitDurationMinutes: { type: "integer" },
    confidenceScore: { type: "number", description: "0-1: how sure the place identity is" },
    missingFields: { type: "array", items: { type: "string" } },
    reasoning: { type: "string" },
  },
  required: ["category", "confidenceScore", "missingFields"],
} as const;

/** The structured record stored on the submission (spec section 4). */
export type ExtractionResult = {
  detectedPlatform: string;
  originalUrl: string;
  resolvedUrl: string;
  placeName?: string;
  placeType?: string;
  category: Category;
  description?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  googlePlaceId?: string;
  estimatedPrice?: number;
  currency?: string;
  priceSource?: string;
  suggestedVisitDurationMinutes?: number;
  openingHours?: unknown;
  images: { url: string; source: string }[];
  sourceEvidence: { sourceType: string; url: string; fields: Record<string, unknown> }[];
  confidenceScore: number;
  extractionStatus: "completed" | "needs_review" | "failed";
  missingFields: string[];
  provider: string;
  isMock: boolean;
};
