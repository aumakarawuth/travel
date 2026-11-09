import { getDict } from "@/i18n";
import { TripForm } from "@/components/trip-form";
import { createTripAction } from "@/app/actions/trips";

export const metadata = { title: "Create Trip" };

export default async function NewTripPage() {
  const { t } = await getDict();
  return (
    <main className="container max-w-xl py-6 pb-24">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">{t.trips.create}</h1>
      <TripForm action={createTripAction} submitLabel={t.form.create}
        labels={{ form: t.form, travelMode: t.travelMode, errors: t.errors, saved: t.common.saved }} />
    </main>
  );
}
