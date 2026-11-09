import type { Category } from "@/lib/ai/schema";

/** One colour per category — reused by list badges now and map pins in Phase 3. */
export const CATEGORY_COLOR: Record<Category, string> = {
  attraction: "#6366f1", cafe: "#a16207", restaurant: "#ef4444", accommodation: "#0ea5e9", activity: "#f97316",
  nature: "#16a34a", shopping: "#ec4899", nightlife: "#7c3aed", viewpoint: "#14b8a6", transportation: "#64748b", other: "#94a3b8",
};

export const CATEGORY_EMOJI: Record<Category, string> = {
  attraction: "🏛️", cafe: "☕", restaurant: "🍜", accommodation: "🏨", activity: "🧗", nature: "🌿",
  shopping: "🛍️", nightlife: "🍸", viewpoint: "🌄", transportation: "🔌", other: "📍",
};
