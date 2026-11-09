"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardPaste, Plus, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { submitLinkAction } from "@/app/actions/submissions";
import { useOnline } from "@/components/pwa/pwa";
import type { Dict } from "@/i18n/th";

/** Fastest possible path: paste → Add. Note field is optional and collapsed. */
export function LinkPaste({ tripId, t, errors, autoFocus, initialUrl, autoSubmit }:
  { tripId: string; t: Dict["inbox"]; errors: Dict["errors"]; autoFocus?: boolean; initialUrl?: string; autoSubmit?: boolean }) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const online = useOnline();

  const submit = (value = url, channel: "paste" | "share_target" = "paste") => start(async () => {
    if (!value.trim()) return;
    if (!navigator.onLine) return void toast.error(t.offline);
    const r = await submitLinkAction(tripId, value, note || undefined, channel);
    if (!r.ok) return void toast.error((errors as Record<string, string>)[r.error] ?? errors.generic);
    toast.success(r.data?.duplicate ? t.duplicate : t.added);
    setUrl(""); setNote(""); setShowNote(false);
    router.refresh();
    ref.current?.focus();
  });

  // arriving from the OS share sheet: submit once, then drop the query so a refresh doesn't resubmit
  const shared = useRef(false);
  useEffect(() => {
    if (!autoSubmit || shared.current || !initialUrl) return;
    shared.current = true;
    submit(initialUrl, "share_target");
    router.replace(window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSubmit, initialUrl]);

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
        <Button disabled={pending || !url.trim() || !online}><Plus />{t.add}</Button>
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
