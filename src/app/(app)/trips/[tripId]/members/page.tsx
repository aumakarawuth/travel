import { getTripContext } from "@/lib/trip-data";
import { getDict } from "@/i18n";
import { canManageInvites } from "@/lib/permissions";
import { InvitePanel } from "./invite-panel";
import { MemberList } from "./member-list";
import { loadExplorePlaces } from "@/lib/explore-data";
import { memberSummary, rankPlaces, tally } from "@/lib/explore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/misc";
import { CATEGORY_EMOJI } from "@/lib/categories";
import Link from "next/link";

export const metadata = { title: "Members" };

export default async function MembersPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const { supabase, trip, members, role, user } = await getTripContext(tripId);
  const { t, locale } = await getDict();
  const people = members.map((m) => ({ id: m.user_id, name: m.profile?.display_name ?? "?", color: m.color ?? m.profile?.color ?? "#64748b", avatar: m.profile?.avatar_url ?? null }));
  const [places, { data: subs }] = await Promise.all([
    loadExplorePlaces(supabase, trip.id),
    supabase.from("link_submissions").select("submitted_by").eq("trip_id", trip.id),
  ]);
  const counts: Record<string, number> = {};
  for (const s of subs ?? []) counts[s.submitted_by] = (counts[s.submitted_by] ?? 0) + 1;
  const summary = memberSummary(people, places, counts);
  const popular = rankPlaces(places).slice(0, 5);
  const code = canManageInvites(role) ? ((await supabase.rpc("get_invite_code", { p_trip: tripId })).data as string | null) : null;
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">{t.members.title}</h1>
      {code ? (
        <InvitePanel tripId={trip.id} tripName={trip.name} code={code} enabled={trip.invite_enabled}
          siteUrl={process.env.NEXT_PUBLIC_SITE_URL ?? ""} t={{ ...t.members, copied: t.common.copied, cancel: t.form.cancel, confirm: t.common.confirm, errors: t.errors }} />
      ) : (
        <p className="text-sm text-muted-foreground">{t.members.onlyEditors}</p>
      )}
      <MemberList tripId={trip.id} meId={user.id} myRole={role} locale={locale}
        members={members.map((m) => ({
          userId: m.user_id, role: m.role, joinedAt: m.joined_at,
          name: m.profile?.display_name ?? "?", avatar: m.profile?.avatar_url ?? null, color: m.color ?? m.profile?.color ?? "#64748b",
        }))}
        t={{ ...t.members, role: t.role, cancel: t.form.cancel, errors: t.errors }} />

      <Card>
        <CardHeader><CardTitle>{t.summary.title}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {summary.map((s) => (
            <div key={s.member.id} className="flex items-center gap-3 text-sm">
              <Avatar name={s.member.name} url={s.member.avatar} color={s.member.color} size={28} />
              <span className="flex-1 truncate">{s.member.name}</span>
              <span className="text-muted-foreground">{s.submissions} {t.summary.submissions} · {s.places} {t.summary.places} · {s.wantVotes} {t.summary.wants}</span>
            </div>
          ))}
          {popular.length > 0 && (
            <div className="border-t pt-3">
              <p className="mb-2 text-sm font-medium">{t.summary.popular}</p>
              <ol className="space-y-1 text-sm">
                {popular.map((p, i) => {
                  const v = tally(p.votes);
                  return (
                    <li key={p.id}>
                      <Link href={`/trips/${trip.id}/places/${p.id}`} className="hover:underline">
                        {i + 1}. {CATEGORY_EMOJI[p.category]} {p.name}
                      </Link>
                      <span className="text-muted-foreground"> · 😍 {v.want} · 🤔 {v.maybe} · {p.submitters.length} {t.summary.submissions}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
