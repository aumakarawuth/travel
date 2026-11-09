import { getTripContext } from "@/lib/trip-data";
import { getDict } from "@/i18n";
import { TripNav } from "@/components/trip-nav";
import { TripSwitcher } from "@/components/trip-switcher";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import Link from "next/link";
import { Settings } from "lucide-react";
import { Badge } from "@/components/ui/misc";

export default async function TripLayout({ children, params }: { children: React.ReactNode; params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const { supabase, user, trip, role } = await getTripContext(tripId);
  const { t } = await getDict();
  const { data: mine } = await supabase
    .from("trip_members").select("trip:trips(id,name,archived_at)").eq("user_id", user.id)
    .returns<{ trip: { id: string; name: string; archived_at: string | null } | null }[]>();
  const trips = (mine ?? []).map((r) => r.trip!).filter((x) => x && (!x.archived_at || x.id === trip.id));

  return (
    <div className="pb-20 md:pb-0">
      <div className="container flex items-center gap-2 pt-4">
        <TripSwitcher current={trip.id} trips={trips} />
        <Badge className="border-primary/30 text-primary">{t.role[role]}</Badge>
        <Link href={`/trips/${trip.id}/settings`} aria-label={t.nav.settings} className="ml-auto rounded-lg p-2 text-muted-foreground hover:bg-accent">
          <Settings className="h-5 w-5" />
        </Link>
      </div>
      <TripNav tripId={trip.id} labels={{ home: t.nav.home, inbox: t.nav.inbox, map: t.nav.map, plan: t.nav.plan, members: t.nav.members }} />
      <RealtimeRefresh tripId={trip.id} tables={["trips", "trip_members"]} />
      <div className="container py-5">{children}</div>
    </div>
  );
}
