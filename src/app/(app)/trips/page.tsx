import Link from "next/link";
import { CalendarDays, Plus, Users, Luggage } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { getDict } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge, EmptyState } from "@/components/ui/misc";
import { formatDateRange } from "@/lib/utils";
import { JoinForm } from "@/components/join-form";
import type { TripRole } from "@/lib/permissions";

export const metadata = { title: "My Trips" };

type Row = {
  role: TripRole;
  trip: { id: string; name: string; start_date: string; end_date: string; day_count: number; archived_at: string | null;
          trip_members: { count: number }[] } | null;
};

export default async function TripsPage() {
  const { supabase, user } = await requireUser("/trips");
  const { t, locale } = await getDict();
  const { data, error } = await supabase
    .from("trip_members")
    .select("role, trip:trips(id,name,start_date,end_date,day_count,archived_at,trip_members(count))")
    .eq("user_id", user.id)
    .returns<Row[]>();
  const rows = (data ?? []).filter((r) => r.trip).sort((a, b) => (a.trip!.start_date < b.trip!.start_date ? -1 : 1));
  const active = rows.filter((r) => !r.trip!.archived_at);
  const archived = rows.filter((r) => r.trip!.archived_at);

  return (
    <main className="container max-w-3xl py-6 pb-24">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{t.trips.title}</h1>
        <Button asChild><Link href="/trips/new"><Plus />{t.trips.create}</Link></Button>
      </div>
      <JoinForm t={{ ...t.trips, errors: t.errors }} />
      {error && <p className="mt-6 text-sm text-destructive">{t.common.error}</p>}
      <div className="mt-6 grid gap-3">
        {active.length === 0 && !error && (
          <EmptyState icon={<Luggage />} title={t.trips.empty} body={t.trips.emptyHint}
            action={<Button asChild><Link href="/trips/new"><Plus />{t.trips.create}</Link></Button>} />
        )}
        {[...active, ...archived].map(({ role, trip }) => (
          <Link key={trip!.id} href={`/trips/${trip!.id}`}>
            <Card className={`p-4 transition hover:border-primary/50 hover:shadow-md ${trip!.archived_at ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold">{trip!.name}</h2>
                <div className="flex gap-1">
                  {trip!.archived_at && <Badge>{t.trips.archived}</Badge>}
                  <Badge className="border-primary/30 text-primary">{t.role[role]}</Badge>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1"><CalendarDays className="h-4 w-4" />{formatDateRange(trip!.start_date, trip!.end_date, locale)} · {trip!.day_count} {t.trips.days}</span>
                <span className="flex items-center gap-1"><Users className="h-4 w-4" />{trip!.trip_members[0]?.count ?? 1} {t.trips.members}</span>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
