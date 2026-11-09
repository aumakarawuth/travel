import { getTripContext } from "@/lib/trip-data";
import { getDict } from "@/i18n";
import { canDeleteTrip, canEditTrip } from "@/lib/permissions";
import { TripForm } from "@/components/trip-form";
import { updateTripAction } from "@/app/actions/trips";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DangerZone } from "./danger-zone";

export const metadata = { title: "Trip Settings" };

export default async function SettingsPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const { trip, role } = await getTripContext(tripId);
  const { t } = await getDict();
  const editable = canEditTrip(role);
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-xl font-bold">{t.settings.title}</h1>
      {!editable && <p className="text-sm text-muted-foreground">{t.settings.readOnly}</p>}
      <TripForm action={updateTripAction.bind(null, trip.id)} initial={trip} readOnly={!editable} submitLabel={t.form.save}
        labels={{ form: t.form, travelMode: t.travelMode, errors: t.errors, saved: t.common.saved }} />
      {editable && (
        <Card className="border-destructive/40">
          <CardHeader><CardTitle className="text-destructive">{t.settings.danger}</CardTitle></CardHeader>
          <CardContent>
            <DangerZone tripId={trip.id} tripName={trip.name} archived={Boolean(trip.archived_at)} canDelete={canDeleteTrip(role)}
              t={{ ...t.settings, cancel: t.form.cancel, errors: t.errors }} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
