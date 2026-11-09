"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, Loader2, RotateCw, Trash2, SearchCheck, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, Badge, EmptyState } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { deleteSubmissionAction, retrySubmissionAction } from "@/app/actions/submissions";
import { CATEGORY_EMOJI } from "@/lib/categories";
import { cn } from "@/lib/utils";
import type { Dict } from "@/i18n/th";
import type { SubmissionView } from "./types";
import { ReviewDialog } from "./review-dialog";

type T = { inbox: Dict["inbox"]; status: Dict["status"]; review: Dict["review"]; category: Dict["category"]; errors: Dict["errors"]; cancel: string };

const STATUS_STYLE: Record<SubmissionView["status"], string> = {
  pending: "border-slate-300 text-slate-600 dark:text-slate-300",
  analyzing: "border-sky-300 text-sky-700 dark:text-sky-300",
  needs_review: "border-amber-300 text-amber-700 dark:text-amber-300",
  completed: "border-emerald-300 text-emerald-700 dark:text-emerald-300",
  failed: "border-red-300 text-red-700 dark:text-red-300",
};
const STATUS_ICON = { pending: Clock, analyzing: Loader2, needs_review: AlertTriangle, completed: CheckCircle2, failed: AlertTriangle };

export function SubmissionList({ items, t, locale, tripId }: { items: SubmissionView[]; t: T; locale: "th" | "en"; tripId: string }) {
  const [who, setWho] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [pending, start] = useTransition();
  const router = useRouter();
  const fmt = new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", { dateStyle: "short", timeStyle: "short" });
  const submitters = useMemo(() => [...new Map(items.map((i) => [i.submitter.id, i.submitter])).values()], [items]);
  const shown = items.filter((i) => (who === "all" || i.submitter.id === who) && (status === "all" || i.status === status));
  const err = (e: string) => (t.errors as Record<string, string>)[e] ?? e;

  if (!items.length) return <EmptyState title={t.inbox.empty} body={t.inbox.emptyHint} />;

  const chip = (active: boolean) => cn("rounded-full border px-3 py-1 text-xs font-medium transition", active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(["all", "needs_review", "analyzing", "completed", "failed"] as const).map((s) => (
          <button key={s} className={chip(status === s)} onClick={() => setStatus(s)}>
            {s === "all" ? t.inbox.all : t.status[s]} {s !== "all" && `(${items.filter((i) => i.status === s).length})`}
          </button>
        ))}
        {submitters.length > 1 && (
          <select value={who} onChange={(e) => setWho(e.target.value)} className="rounded-full border bg-background px-3 py-1 text-xs" aria-label={t.inbox.by}>
            <option value="all">{t.inbox.by}: {t.inbox.all}</option>
            {submitters.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </div>

      {shown.map((s) => {
        const ex = s.meta.extraction;
        const Icon = STATUS_ICON[s.status];
        const title = ex?.placeName ?? s.meta.title ?? new URL(s.resolvedUrl ?? s.originalUrl).hostname;
        return (
          <Card key={s.id} className="p-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-2xl" aria-hidden>{ex ? CATEGORY_EMOJI[ex.category] : "🔗"}</span>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-medium">{title}</p>
                  <Badge className={STATUS_STYLE[s.status]}>
                    <Icon className={cn("mr-1 h-3 w-3", s.status === "analyzing" && "animate-spin")} />{t.status[s.status]}
                  </Badge>
                  {ex?.isMock && <Badge className="border-fuchsia-300 text-fuchsia-700 dark:text-fuchsia-300">{t.inbox.mock}</Badge>}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {s.platform} · {ex && t.category[ex.category]} {ex && `· ${t.inbox.confidence} ${Math.round(ex.confidenceScore * 100)}%`}
                </p>
                {s.meta.blockedByPlatform && <p className="text-xs text-amber-700 dark:text-amber-300">{t.inbox.restricted}</p>}
                {s.error && <p className="text-xs text-destructive">{err(s.error)}</p>}
                {s.note && <p className="text-xs italic text-muted-foreground">“{s.note}”</p>}
                <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                  <Avatar name={s.submitter.name} url={s.submitter.avatar} color={s.submitter.color} size={20} />
                  <span>{s.submitter.name}</span><span>·</span><span>{fmt.format(new Date(s.submittedAt))}</span>
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(s.status === "needs_review" || s.status === "completed") && (
                <ReviewDialog submission={s} t={t} tripId={tripId}
                  trigger={<Button size="sm" variant={s.status === "needs_review" ? "default" : "outline"}><SearchCheck />{t.inbox.review}</Button>} />
              )}
              {(s.status === "failed" || s.status === "needs_review") && (
                <Button size="sm" variant="outline" disabled={pending}
                  onClick={() => start(async () => { const r = await retrySubmissionAction(s.id); if (!r.ok) toast.error(err(r.error)); else router.refresh(); })}>
                  <RotateCw />{t.inbox.retry}
                </Button>
              )}
              <Button size="sm" variant="ghost" asChild>
                <a href={s.originalUrl} target="_blank" rel="noopener noreferrer nofollow"><ExternalLink />{t.inbox.open}</a>
              </Button>
              {s.mine && (
                <ConfirmDialog title={t.inbox.delete} body={t.inbox.deleteConfirm} confirmLabel={t.inbox.delete} cancelLabel={t.cancel} destructive
                  trigger={<Button size="sm" variant="ghost" className="ml-auto text-destructive" aria-label={t.inbox.delete}><Trash2 /></Button>}
                  onConfirm={async () => { const r = await deleteSubmissionAction(s.id); if (!r.ok) toast.error(err(r.error)); else router.refresh(); }} />
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
