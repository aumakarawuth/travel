import Link from "next/link";
import { CalendarDays, Clock, Wallet, Route, Link2, Users } from "lucide-react";
import { getTripContext } from "@/lib/trip-data";
import { getDict } from "@/i18n";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar } from "@/components/ui/misc";
import { formatDateRange, formatMoney } from "@/lib/utils";

export default async function TripOverview({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const { trip, members } = await getTripContext(tripId);
  const { t, locale } = await getDict();
  const stats = [
    { icon: CalendarDays, label: t.overview.dates, value: `${formatDateRange(trip.start_date, trip.end_date, locale)} (${trip.day_count} ${t.trips.days})` },
    { icon: Clock, label: t.overview.daily, value: `${trip.daily_start_time.slice(0, 5)} – ${trip.daily_end_time.slice(0, 5)}` },
    { icon: Wallet, label: t.overview.budget, value: formatMoney(trip.budget_total, trip.currency, locale) ?? t.overview.noBudget },
    { icon: Route, label: t.overview.route, value: [trip.start_location_name, trip.end_location_name].filter(Boolean).join(" → ") || "—" },
  ];
  return (
    <div className="space-y-5">
      {/* quick add — wired up in Phase 2 */}
      <Card className="border-primary/30 bg-accent/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Link2 className="h-5 w-5 text-primary" />{t.overview.quickAdd}</CardTitle>
          <CardDescription>{t.overview.quickAddSoon}</CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        {stats.map(({ icon: Icon, label, value }) => (
          <Card key={label} className="flex items-start gap-3 p-4">
            <div className="rounded-xl bg-muted p-2 text-primary"><Icon className="h-5 w-5" /></div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="truncate font-medium">{value}</p>
            </div>
          </Card>
        ))}
      </div>

      {trip.description && <Card className="p-4 text-sm whitespace-pre-wrap">{trip.description}</Card>}

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />{t.nav.members} ({members.length})</CardTitle>
          <Link href={`/trips/${trip.id}/members`} className="text-sm font-medium text-primary">{t.members.invite}</Link>
        </CardHeader>
        <CardContent className="flex -space-x-2">
          {members.slice(0, 12).map((m) => (
            <Avatar key={m.user_id} name={m.profile?.display_name ?? "?"} url={m.profile?.avatar_url} color={m.color ?? m.profile?.color ?? "#64748b"} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
