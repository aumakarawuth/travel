"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardPaste, Plus, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { submitLinkAction } from "@/app/actions/submissions";
import type { Dict } from "@/i18n/th";

/** Fastest possible path: paste → Add. Note field is optional and collapsed. */
export function LinkPaste({ tripId, t, errors, autoFocus, initialUrl }:
  { tripId: string; t: Dict["inbox"]; errors: Dict["errors"]; autoFocus?: boolean; initialUrl?: string }) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);

  const submit = (value = url) => start(async () => {
    if (!value.trim()) return;
    const r = await submitLinkAction(tripId, value, note || undefined);
    if (!r.ok) return void toast.error((errors as Record<string, string>)[r.error] ?? errors.generic);
    toast.success(r.data?.duplicate ? t.duplicate : t.added);
    setUrl(""); setNote(""); setShowNote(false);
    router.refresh();
    ref.current?.focus();
  });

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) { setUrl(text); submit(text); }
    } catch { ref.current?.focus(); }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-2">
      <div className="flex gap-2">
        <Input ref={ref} value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t.paste} aria-label={t.paste}
          inputMode="url" autoComplete="off" autoFocus={autoFocus} maxLength={2048}
          onPaste={(e) => { const v = e.clipboardData.getData("text"); if (v && !url) { e.preventDefault(); setUrl(v); submit(v); } }} />
        <Button type="button" variant="outline" size="icon" onClick={pasteFromClipboard} aria-label="Paste" disabled={pending}><ClipboardPaste /></Button>
        <Button disabled={pending || !url.trim()}><Plus />{t.add}</Button>
      </div>
      {showNote ? (
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.note} maxLength={2000} />
      ) : (
        <button type="button" onClick={() => setShowNote(true)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <StickyNote className="h-3.5 w-3.5" />{t.note}
        </button>
      )}
    </form>
  );
}
