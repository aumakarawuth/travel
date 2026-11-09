import Link from "next/link";
import { MapPin, MapPinOff } from "lucide-react";
import { getTripContext } from "@/lib/trip-data";
import { getDict } from "@/i18n";
import { loadPlaces, loadSubmissions } from "@/lib/inbox-data";
import { LinkPaste } from "@/components/inbox/link-paste";
import { SubmissionList } from "@/components/inbox/submission-list";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/misc";
import { CATEGORY_COLOR, CATEGORY_EMOJI } from "@/lib/categories";
import type { Category } from "@/lib/ai/schema";

export const metadata = { title: "Inbox" };
export const maxDuration = 60; // link analysis runs in after() within this budget

export default async function InboxPage({ params, searchParams }: { params: Promise<{ tripId: string }>; searchParams: Promise<{ url?: string; shared?: string }> }) {
  const { tripId } = await params;
  const { url, shared } = await searchParams;
  const { supabase, user, trip } = await getTripContext(tripId);
  const { t, locale } = await getDict();
  const [items, places] = await Promise.all([loadSubmissions(supabase, trip.id, user.id), loadPlaces(supabase, trip.id)]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <RealtimeRefresh tripId={trip.id} tables={["link_submissions", "places"]} />
      <section className="space-y-4">
        <h1 className="text-xl font-bold">{t.inbox.title}</h1>
        <LinkPaste tripId={trip.id} t={t.inbox} errors={t.errors} autoFocus={!items.length} initialUrl={shared ?? url} autoSubmit={Boolean(shared)} />
        <SubmissionList items={items} tripId={trip.id} locale={locale}
          t={{ inbox: t.inbox, status: t.status, review: t.review, category: t.category, errors: t.errors, cancel: t.form.cancel }} />
      </section>
      <aside className="space-y-3">
        <h2 className="font-semibold">{t.inbox.places} ({places.length})</h2>
        {!places.length && <p className="text-sm text-muted-foreground">{t.inbox.noPlaces}</p>}
        {places.map((p) => {
          const people = [...new Map(p.place_submissions.map((s) => [s.submitted_by, s.profile])).entries()];
          return (
            <Link key={p.id} href={`/trips/${trip.id}/places/${p.id}`}>
              <Card className="flex items-center gap-3 p-3 transition hover:border-primary/50">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg" style={{ backgroundColor: CATEGORY_COLOR[p.category as Category] + "22" }}>
                  {CATEGORY_EMOJI[p.category as Category]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    {p.location_verified ? <><MapPin className="h-3 w-3 text-emerald-600" />{t.inbox.verified}</> : <><MapPinOff className="h-3 w-3" />{t.inbox.noLocation}</>}
                  </p>
                </div>
                <div className="flex -space-x-2">
                  {people.slice(0, 3).map(([id, pr]) => <Avatar key={id} name={pr?.display_name ?? "?"} color={pr?.color ?? "#64748b"} size={24} />)}
                </div>
              </Card>
            </Link>
          );
        })}
      </aside>
    </div>
  );
}
