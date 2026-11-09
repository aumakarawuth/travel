import { getTripContext } from "@/lib/trip-data";
import { getDict } from "@/i18n";
import { canManageInvites } from "@/lib/permissions";
import { InvitePanel } from "./invite-panel";
import { MemberList } from "./member-list";

export const metadata = { title: "Members" };

export default async function MembersPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const { supabase, trip, members, role, user } = await getTripContext(tripId);
  const { t, locale } = await getDict();
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
    </div>
  );
}
