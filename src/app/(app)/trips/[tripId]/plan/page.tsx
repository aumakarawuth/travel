import { getTripContext } from "@/lib/trip-data";
import { getDict } from "@/i18n";
import { canEditTrip } from "@/lib/permissions";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { PlanView } from "@/components/plan/plan-view";
import { Hotels } from "@/components/plan/hotels";
import { tripDates } from "@/lib/planner/build-input";
import type { StoredPlan } from "@/lib/planner/run";

export const metadata = { title: "AI Planner" };
export const maxDuration = 60;

export default async function PlanPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const { supabase, trip, role } = await getTripContext(tripId);
  const { t, locale } = await getDict();
  const [{ data: versions }, { data: hotels }, { data: hotelPlaces }, { count: selectedCount }] = await Promise.all([
    supabase.from("itinerary_versions").select("id,version,label,created_at,is_active,input_snapshot").eq("trip_id", trip.id).order("version", { ascending: false }).limit(20),
    supabase.from("accommodations").select("id,name,lat,lng,check_in_date,check_out_date,price_per_night,currency,room_count,status,booking_reference").eq("trip_id", trip.id).order("check_in_date"),
    supabase.from("places").select("id,name").eq("trip_id", trip.id).eq("category", "accommodation").eq("location_verified", true),
    supabase.from("trip_place_selections").select("place_id", { count: "exact", head: true }).eq("trip_id", trip.id).in("status", ["selected", "scheduled"]),
  ]);
  const active = versions?.find((v) => v.is_active);
  const plan = (active?.input_snapshot as { result?: StoredPlan } | undefined)?.result ?? null;
  const fmt = new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const dateLabels = Object.fromEntries(tripDates(trip.start_date, trip.end_date).map((d) => [d, fmt.format(new Date(`${d}T00:00:00Z`))]));
  const canEdit = canEditTrip(role);

  return (
    <div className="space-y-4">
      <RealtimeRefresh tripId={trip.id} tables={["itinerary_versions", "accommodations"]} />
      <h1 className="text-xl font-bold">{t.plan.title}</h1>
      <Hotels tripId={trip.id} canEdit={canEdit} locale={locale} startDate={trip.start_date} endDate={trip.end_date} t={t.hotel} errors={t.errors}
        candidates={hotelPlaces ?? []}
        hotels={(hotels ?? []).map((h) => ({ id: h.id, name: h.name, checkIn: h.check_in_date, checkOut: h.check_out_date, price: h.price_per_night, currency: h.currency,
          rooms: h.room_count, status: h.status, hasCoords: h.lat !== null && h.lng !== null, ref: h.booking_reference }))} />
      <PlanView key={active?.id ?? "none"} tripId={trip.id} plan={plan} canEdit={canEdit} selectedCount={selectedCount ?? 0} locale={locale} dateLabels={dateLabels}
        versions={(versions ?? []).map((v) => ({ id: v.id, version: v.version, label: v.label, createdAt: v.created_at, active: v.is_active }))}
        t={{ plan: t.plan, reason: t.reason, note: t.note, warn: t.warn, explainCode: t.explainCode, errors: t.errors }} />
    </div>
  );
}
