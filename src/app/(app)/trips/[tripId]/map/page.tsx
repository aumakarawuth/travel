import { getTripContext } from "@/lib/trip-data";
import { getDict } from "@/i18n";
import { loadExplorePlaces } from "@/lib/explore-data";
import { canEditTrip } from "@/lib/permissions";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { Explorer } from "@/components/explore/explorer";

export const metadata = { title: "Explore Map" };

export default async function MapPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const { supabase, user, trip, members, role } = await getTripContext(tripId);
  const { t, locale } = await getDict();
  const places = await loadExplorePlaces(supabase, trip.id);
  return (
    <div className="space-y-3">
      <RealtimeRefresh tripId={trip.id} tables={["places", "place_votes", "trip_place_selections", "place_comments"]} />
      <h1 className="text-xl font-bold">{t.explore.title}</h1>
      <Explorer tripId={trip.id} places={places} meId={user.id} canEdit={canEditTrip(role)} locale={locale}
        provider={process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ? "google" : "osm"}
        members={members.map((m) => ({ id: m.user_id, name: m.profile?.display_name ?? "?", color: m.color ?? m.profile?.color ?? "#64748b", avatar: m.profile?.avatar_url ?? null }))}
        t={{ explore: t.explore, category: t.category, vote: t.vote, selection: t.selection, priority: t.priority, errors: t.errors }} />
    </div>
  );
}
