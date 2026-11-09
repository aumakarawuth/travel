"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Avatar } from "@/components/ui/misc";
import { addCommentAction, deleteCommentAction } from "@/app/actions/collab";
import type { Dict } from "@/i18n/th";

export type CommentView = { id: string; body: string; createdAt: string; deleted: boolean; mine: boolean; author: { name: string; color: string; avatar: string | null } };

export function Comments({ placeId, comments, locale, t, errors }: { placeId: string; comments: CommentView[]; locale: "th" | "en"; t: Dict["comments"]; errors: Dict["errors"] }) {
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const fmt = new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", { dateStyle: "short", timeStyle: "short" });
  const fail = (e: string) => toast.error((errors as Record<string, string>)[e] ?? errors.generic);

  return (
    <div className="space-y-3">
      {!comments.length && <p className="text-sm text-muted-foreground">{t.empty}</p>}
      {comments.map((c) => (
        <div key={c.id} className="flex gap-2">
          <Avatar name={c.author.name} url={c.author.avatar} color={c.author.color} size={28} />
          <div className="min-w-0 flex-1 rounded-xl bg-muted px-3 py-2">
            <p className="text-xs text-muted-foreground">{c.author.name} · {fmt.format(new Date(c.createdAt))}</p>
            {/* rendered as text — React escapes it, no HTML from users */}
            <p className={`whitespace-pre-wrap break-words text-sm ${c.deleted ? "italic text-muted-foreground" : ""}`}>{c.deleted ? t.deleted : c.body}</p>
          </div>
          {c.mine && !c.deleted && (
            <Button variant="ghost" size="icon" aria-label={t.delete} disabled={pending}
              onClick={() => start(async () => { const r = await deleteCommentAction(c.id); if (!r.ok) fail(r.error); router.refresh(); })}><Trash2 /></Button>
          )}
        </div>
      ))}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!body.trim()) return;
        start(async () => { const r = await addCommentAction(placeId, body); if (!r.ok) { fail(r.error); return; } setBody(""); router.refresh(); }); }}>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={t.placeholder} maxLength={2000} className="min-h-11" rows={1} />
        <Button disabled={pending || !body.trim()} aria-label={t.send}><Send /></Button>
      </form>
    </div>
  );
}
