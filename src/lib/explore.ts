/** Pure helpers for the Explore map/list, voting and member summary. No I/O — unit tested. */
import type { Category } from "@/lib/ai/schema";

export type VoteValue = "want" | "maybe" | "not_interested";
export type PlaceStatus = "proposed" | "shortlisted" | "selected" | "rejected" | "scheduled";
export type Priority = "must_visit" | "high" | "normal" | "optional";
export type Person = { id: string; name: string; color: string; avatar: string | null };

export type ExplorePlace = {
  id: string; name: string; category: Category; description: string | null; address: string | null;
  lat: number | null; lng: number | null; locationVerified: boolean; googlePlaceId: string | null;
  price: number | null; currency: string | null; image: { url: string; source: string } | null;
  status: PlaceStatus; priority: Priority; note: string | null;
  submitters: Person[]; sourceUrls: string[];
  votes: { userId: string; vote: VoteValue }[];
  commentCount: number;
};

export type Filters = {
  categories: Category[]; // empty = all
  memberId: string | "all";
  statuses: PlaceStatus[]; // empty = all
  maxPrice: number | null; // null = any; places without a price are kept
  selection: "all" | "selected" | "unselected";
  query: string;
};

export const EMPTY_FILTERS: Filters = { categories: [], memberId: "all", statuses: [], maxPrice: null, selection: "all", query: "" };

const SELECTED: PlaceStatus[] = ["selected", "scheduled"];

export function isSelected(p: Pick<ExplorePlace, "status">) {
  return SELECTED.includes(p.status);
}

export function filterPlaces(places: ExplorePlace[], f: Filters): ExplorePlace[] {
  const q = f.query.trim().toLowerCase();
  return places.filter((p) =>
    (!f.categories.length || f.categories.includes(p.category)) &&
    (f.memberId === "all" || p.submitters.some((s) => s.id === f.memberId)) &&
    (!f.statuses.length || f.statuses.includes(p.status)) &&
    (f.maxPrice === null || p.price === null || p.price <= f.maxPrice) &&
    (f.selection === "all" || (f.selection === "selected") === isSelected(p)) &&
    (!q || p.name.toLowerCase().includes(q) || (p.address ?? "").toLowerCase().includes(q)),
  );
}

/** Only verified coordinates are pinned; everything else is listed under "needs location". */
export function splitPinnable(places: ExplorePlace[]) {
  const pinned: ExplorePlace[] = [], unpinned: ExplorePlace[] = [];
  for (const p of places) (p.locationVerified && p.lat !== null && p.lng !== null ? pinned : unpinned).push(p);
  return { pinned, unpinned };
}

export function tally(votes: ExplorePlace["votes"]) {
  const t = { want: 0, maybe: 0, not_interested: 0 };
  for (const v of votes) t[v.vote]++;
  return t;
}

/** Interest score: want=2, maybe=1, not=-1, plus 1 per extra submitter; must_visit floats to the top. */
export function interestScore(p: ExplorePlace) {
  const t = tally(p.votes);
  return t.want * 2 + t.maybe - t.not_interested + Math.max(0, p.submitters.length - 1) + (p.priority === "must_visit" ? 100 : 0);
}

export function rankPlaces(places: ExplorePlace[]) {
  return [...places].sort((a, b) => interestScore(b) - interestScore(a) || a.name.localeCompare(b.name));
}

export type MemberSummary = { member: Person; submissions: number; places: number; wantVotes: number };

export function memberSummary(
  members: Person[], places: ExplorePlace[], submissionCounts: Record<string, number>,
): MemberSummary[] {
  return members
    .map((m) => ({
      member: m,
      submissions: submissionCounts[m.id] ?? 0,
      places: places.filter((p) => p.submitters.some((s) => s.id === m.id)).length,
      wantVotes: places.reduce((n, p) => n + p.votes.filter((v) => v.userId === m.id && v.vote === "want").length, 0),
    }))
    .sort((a, b) => b.submissions - a.submissions || a.member.name.localeCompare(b.member.name));
}

/** Google Maps URL (official "Maps URLs" API=1 format) for one place. */
export function placeMapsUrl(p: Pick<ExplorePlace, "lat" | "lng" | "googlePlaceId" | "name">) {
  if (p.lat === null || p.lng === null) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name)}`;
  const id = p.googlePlaceId ? `&query_place_id=${encodeURIComponent(p.googlePlaceId)}` : "";
  return `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}${id}`;
}

export function directionsUrl(p: Pick<ExplorePlace, "lat" | "lng" | "googlePlaceId">) {
  if (p.lat === null || p.lng === null) return null;
  const id = p.googlePlaceId ? `&destination_place_id=${encodeURIComponent(p.googlePlaceId)}` : "";
  return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}${id}`;
}
