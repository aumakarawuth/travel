"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, RefreshCw, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { regenerateCodeAction, setInviteEnabledAction } from "@/app/actions/members";
import { inviteUrl } from "@/lib/invite";
import type { Dict } from "@/i18n/th";

type T = Dict["members"] & { copied: string; cancel: string; confirm: string; errors: Dict["errors"] };

export function InvitePanel({ tripId, tripName, code: initial, enabled, siteUrl, t }:
  { tripId: string; tripName: string; code: string; enabled: boolean; siteUrl: string; t: T }) {
  const [code, setCode] = useState(initial);
  const [pending, start] = useTransition();
  const link = inviteUrl(siteUrl || (typeof window !== "undefined" ? window.location.origin : ""), code);
  const fail = (e: string) => toast.error((t.errors as Record<string, string>)[e] ?? t.errors.generic);

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(t.copied); } catch { toast.error(text); }
  };
  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: tripName, text: `${tripName} — ${t.inviteCode}: ${code}`, url: link }); } catch { /* cancelled */ }
    } else copy(link);
  };

  return (
    <Card>
      <CardHeader><CardTitle>{t.invite}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className={`rounded-xl bg-muted p-4 text-center ${enabled ? "" : "opacity-50"}`}>
          <p className="text-xs text-muted-foreground">{t.inviteCode}</p>
          <p className="font-mono text-3xl font-bold tracking-[0.3em]">{code}</p>
          {!enabled && <p className="mt-1 text-xs text-destructive">{t.inviteDisabled}</p>}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Button variant="secondary" onClick={() => copy(code)}><Copy />{t.copyCode}</Button>
          <Button variant="secondary" onClick={() => copy(link)}><Copy />{t.copyLink}</Button>
          <Button onClick={share}><Share2 />{t.share}</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <ConfirmDialog title={t.regenerate} body={t.regenerateConfirm} confirmLabel={t.confirm} cancelLabel={t.cancel}
            trigger={<Button variant="outline" size="sm" disabled={pending}><RefreshCw />{t.regenerate}</Button>}
            onConfirm={async () => { const r = await regenerateCodeAction(tripId); if (r.ok && r.data) setCode(r.data); else if (!r.ok) fail(r.error); }} />
          <Button variant="outline" size="sm" disabled={pending}
            onClick={() => start(async () => { const r = await setInviteEnabledAction(tripId, !enabled); if (!r.ok) fail(r.error); })}>
            {enabled ? t.disableInvite : t.enableInvite}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
