import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, MapPin } from "lucide-react";
import { getTripContext } from "@/lib/trip-data";
import { getDict } from "@/i18n";
import { uuidSchema } from "@/lib/validation/trip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, Badge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { CATEGORY_COLOR, CATEGORY_EMOJI } from "@/lib/categories";
import { formatMoney } from "@/lib/utils";
import type { Category } from "@/lib/ai/schema";

type Place = {
  id: string; name: string; category: Category; description: string | null; address: string | null; lat: number | null; lng: number | null;
  google_place_id: string | null; location_verified: boolean; estimated_price: number | null; currency: string | null; price_source: string | null;
  price_checked_at: string | null; opening_hours: { weekdayText?: string[] } | null; opening_hours_source: string | null; opening_hours_checked_at: string | null;
  visit_duration_minutes: number | null; images: { url: string; source: string }[];
  place_sources: { id: string; source_type: string; url: string | null; fetched_at: string }[];
  place_submissions: { created_at: string; submission: { original_url: string; platform: string } | null; profile: { display_name: string; color: string; avatar_url: string | null } | null }[];
};

export default async function PlacePage({ params }: { params: Promise<{ tripId: string; placeId: string }> }) {
  const { tripId, placeId } = await params;
  if (!uuidSchema.safeParse(placeId).success) notFound();
  const { supabase, trip } = await getTripContext(tripId);
  const { t, locale } = await getDict();
  const { data: p } = await supabase.from("places")
    .select("*,place_sources(id,source_type,url,fetched_at),place_submissions(created_at,submission:link_submissions(original_url,platform),profile:profiles(display_name,color,avatar_url))")
    .eq("id", placeId).eq("trip_id", trip.id).maybeSingle<Place>();
  if (!p) notFound();
  const fmt = new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", { dateStyle: "medium" });
  const mapsUrl = p.lat !== null && p.lng !== null
    ? `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}${p.google_place_id ? `&query_place_id=${encodeURIComponent(p.google_place_id)}` : ""}`
    : null;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href={`/trips/${trip.id}/inbox`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />{t.place.back}</Link>
      {p.images[0] && (
        <figure>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.images[0].url} alt={p.name} className="max-h-72 w-full rounded-2xl object-cover" referrerPolicy="no-referrer" loading="lazy" />
          <figcaption className="mt-1 text-xs text-muted-foreground">{t.place.source}: {p.images[0].source}</figcaption>
        </figure>
      )}
      <div>
        <Badge style={{ borderColor: CATEGORY_COLOR[p.category], color: CATEGORY_COLOR[p.category] }}>{CATEGORY_EMOJI[p.category]} {t.category[p.category]}</Badge>
        <h1 className="mt-2 text-2xl font-bold">{p.name}</h1>
        {p.address && <p className="mt-1 text-sm text-muted-foreground">{p.address}</p>}
        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" />{p.location_verified ? t.inbox.verified : t.inbox.noLocation}</p>
      </div>
      {p.description && <p className="text-sm">{p.description}</p>}
      {mapsUrl && <Button asChild variant="secondary"><a href={mapsUrl} target="_blank" rel="noopener noreferrer"><ExternalLink />{t.place.openMaps}</a></Button>}

      <div className="grid gap-3 sm:grid-cols-2">
        {p.estimated_price !== null && (
          <Card className="p-4 text-sm">
            <p className="text-xs text-muted-foreground">{t.place.price}</p>
            <p className="font-medium">{formatMoney(p.estimated_price, p.currency ?? "THB", locale)}</p>
            <p className="mt-1 break-words text-xs text-muted-foreground">{t.place.source}: {p.price_source}{p.price_checked_at && ` · ${t.place.checked} ${fmt.format(new Date(p.price_checked_at))}`}</p>
          </Card>
        )}
        {p.opening_hours?.weekdayText && (
          <Card className="p-4 text-sm">
            <p className="text-xs text-muted-foreground">{t.place.hours}</p>
            <ul className="mt-1 space-y-0.5">{p.opening_hours.weekdayText.map((d) => <li key={d}>{d}</li>)}</ul>
            <p className="mt-1 text-xs text-muted-foreground">{t.place.source}: {p.opening_hours_source}{p.opening_hours_checked_at && ` · ${t.place.checked} ${fmt.format(new Date(p.opening_hours_checked_at))}`}</p>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle>{t.place.submittedBy} ({p.place_submissions.length})</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {p.place_submissions.map((s, i) => (
            <div key={i} className="flex items-center gap-3 text-sm">
              <Avatar name={s.profile?.display_name ?? "?"} url={s.profile?.avatar_url} color={s.profile?.color ?? "#64748b"} size={28} />
              <span className="flex-1">{s.profile?.display_name} · <span className="text-muted-foreground">{s.submission?.platform} · {fmt.format(new Date(s.created_at))}</span></span>
              {s.submission && <a href={s.submission.original_url} target="_blank" rel="noopener noreferrer nofollow" className="text-primary" aria-label={t.inbox.open}><ExternalLink className="h-4 w-4" /></a>}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t.place.sources}</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-xs text-muted-foreground">
          {p.place_sources.map((s) => (
            <p key={s.id} className="truncate">{s.source_type} · {fmt.format(new Date(s.fetched_at))}{s.url && <> · <span title={s.url}>{s.url}</span></>}</p>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
