"use client";
import { useTransition } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Avatar, Badge } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { leaveTripAction, removeMemberAction, setRoleAction } from "@/app/actions/members";
import { canChangeRole, canLeaveTrip, canRemoveMember, type TripRole } from "@/lib/permissions";
import type { Dict } from "@/i18n/th";

type M = { userId: string; role: TripRole; joinedAt: string; name: string; avatar: string | null; color: string };
type T = Dict["members"] & { role: Dict["role"]; cancel: string; errors: Dict["errors"] };

export function MemberList({ tripId, meId, myRole, members, t, locale }:
  { tripId: string; meId: string; myRole: TripRole; members: M[]; t: T; locale: "th" | "en" }) {
  const [pending, start] = useTransition();
  const fail = (e: string) => toast.error((t.errors as Record<string, string>)[e] ?? t.errors.generic);
  const fmt = new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", { dateStyle: "medium" });

  return (
    <Card className="divide-y">
      {members.map((m) => {
        const isMe = m.userId === meId;
        return (
          <div key={m.userId} className="flex items-center gap-3 p-4">
            <Avatar name={m.name} url={m.avatar} color={m.color} size={40} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{m.name} {isMe && <span className="text-muted-foreground">({t.you})</span>}</p>
              <p className="text-xs text-muted-foreground">{t.joined} {fmt.format(new Date(m.joinedAt))}</p>
            </div>
            {canChangeRole(myRole, meId, m.userId) && m.role !== "owner" ? (
              <Select aria-label="role" className="h-9 w-28" value={m.role} disabled={pending}
                onChange={(e) => start(async () => { const r = await setRoleAction(tripId, m.userId, e.target.value as TripRole); if (!r.ok) fail(r.error); })}>
                <option value="editor">{t.role.editor}</option>
                <option value="member">{t.role.member}</option>
              </Select>
            ) : (
              <Badge>{t.role[m.role]}</Badge>
            )}
            {canChangeRole(myRole, meId, m.userId) && m.role !== "owner" && (
              <ConfirmDialog title={t.makeOwner} body={t.makeOwnerConfirm} confirmLabel={t.makeOwner} cancelLabel={t.cancel}
                trigger={<Button variant="ghost" size="sm" className="hidden sm:inline-flex">{t.makeOwner}</Button>}
                onConfirm={async () => { const r = await setRoleAction(tripId, m.userId, "owner"); if (!r.ok) fail(r.error); }} />
            )}
            {canRemoveMember(myRole, m.role, meId, m.userId) && (
              <ConfirmDialog title={t.remove} body={t.removeConfirm} confirmLabel={t.remove} cancelLabel={t.cancel} destructive
                trigger={<Button variant="ghost" size="sm" className="text-destructive">{t.remove}</Button>}
                onConfirm={async () => { const r = await removeMemberAction(tripId, m.userId); if (!r.ok) fail(r.error); }} />
            )}
            {isMe && canLeaveTrip(myRole) && (
              <ConfirmDialog title={t.leave} body={t.leaveConfirm} confirmLabel={t.leave} cancelLabel={t.cancel} destructive
                trigger={<Button variant="ghost" size="sm" className="text-destructive">{t.leave}</Button>}
                onConfirm={async () => { const r = await leaveTripAction(tripId); if (r && !r.ok) fail(r.error); }} />
            )}
          </div>
        );
      })}
    </Card>
  );
}
