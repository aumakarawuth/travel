import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { getDict } from "@/i18n";
import { extractUrl, checkUrl } from "@/lib/url/normalize";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Share" };

/** Web Share Target (GET). Android share sheets often put the link in `text`, not `url`. */
export default async function SharePage({ searchParams }: { searchParams: Promise<{ url?: string; text?: string; title?: string; trip?: string }> }) {
  const sp = await searchParams;
  const { t } = await getDict();
  const raw = [sp.url, sp.text, sp.title].filter(Boolean).join(" ").slice(0, 4000);
  const found = extractUrl(raw);
  const url = found && checkUrl(found).ok ? found : null;
  if (!url) {
    return <main className="container max-w-md py-12"><EmptyState title={t.pwa.noUrl} body={raw.slice(0, 200)} action={<Button asChild variant="outline"><Link href="/trips">{t.nav.trips}</Link></Button>} /></main>;
  }

  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("trip_members").select("trip:trips(id,name,archived_at,start_date)").eq("user_id", user.id)
    .returns<{ trip: { id: string; name: string; archived_at: string | null; start_date: string } | null }[]>();
  const trips = (data ?? []).map((r) => r.trip!).filter((x) => x && !x.archived_at);
  const go = (id: string) => redirect(`/trips/${id}/inbox?shared=${encodeURIComponent(url)}`);

  const chosen = sp.trip && trips.find((x) => x.id === sp.trip);
  if (chosen) go(chosen.id);
  const last = (await cookies()).get("last_trip")?.value;
  if (last && trips.some((x) => x.id === last)) go(last);
  if (trips.length === 1) go(trips[0].id);

  return (
    <main className="container max-w-md space-y-4 py-8">
      <h1 className="text-xl font-bold">{t.pwa.shareTitle}</h1>
      <p className="break-all rounded-xl bg-muted p-3 text-xs">{url}</p>
      {!trips.length && <EmptyState title={t.pwa.noTrips} action={<Button asChild><Link href="/trips/new">{t.trips.create}</Link></Button>} />}
      {trips.length > 0 && <p className="text-sm text-muted-foreground">{t.pwa.chooseTrip}</p>}
      {trips.map((x) => (
        <Link key={x.id} href={`/share?trip=${x.id}&url=${encodeURIComponent(url)}`}>
          <Card className="mb-2 p-4 font-medium hover:border-primary/50">{x.name}</Card>
        </Link>
      ))}
    </main>
  );
}
