import { PhasePlaceholder } from "@/components/phase-placeholder";
import { getTripContext } from "@/lib/trip-data";
import { getDict } from "@/i18n";

export default async function Page({ params }: { params: Promise<{ tripId: string }> }) {
  await getTripContext((await params).tripId); // enforces membership
  const { t } = await getDict();
  return <PhasePlaceholder phase={4} title={t.nav.plan} />;
}
