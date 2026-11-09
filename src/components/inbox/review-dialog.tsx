"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { MapPin, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { confirmReviewAction, searchPlacesAction } from "@/app/actions/submissions";
import { CATEGORIES, type Category } from "@/lib/ai/schema";
import type { PlaceCandidate } from "@/lib/places/google-places";
import { cn } from "@/lib/utils";
import type { Dict } from "@/i18n/th";
import type { SubmissionView } from "./types";

type T = { inbox: Dict["inbox"]; review: Dict["review"]; category: Dict["category"]; errors: Dict["errors"]; cancel: string };
type Pin = { kind: "candidate"; c: PlaceCandidate } | { kind: "link" } | { kind: "none" };

export function ReviewDialog({ submission: s, t, trigger }: { submission: SubmissionView; t: T; tripId: string; trigger: React.ReactNode }) {
  const ex = s.meta.extraction;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(ex?.placeName ?? s.note ?? "");
  const [category, setCategory] = useState<Category>(ex?.category ?? "other");
  const [description, setDescription] = useState(ex?.description ?? "");
  const [address, setAddress] = useState(ex?.address ?? "");
  const [visit, setVisit] = useState<string>(ex?.suggestedVisitDurationMinutes ? String(ex.suggestedVisitDurationMinutes) : "");
  const [candidates, setCandidates] = useState<PlaceCandidate[]>(s.meta.candidates ?? []);
  const [placesOn, setPlacesOn] = useState<boolean>(s.meta.placesConfigured ?? true);
  const [query, setQuery] = useState(ex?.placeName ?? "");
  const hasLinkPin = typeof ex?.latitude === "number";
  const [pin, setPin] = useState<Pin>(hasLinkPin ? { kind: "link" } : { kind: "none" });
  const [searching, startSearch] = useTransition();
  const [saving, startSave] = useTransition();
  const router = useRouter();

  const search = () => startSearch(async () => {
    const r = await searchPlacesAction(query);
    if (!r.ok) return void toast.error(t.errors.generic);
    setPlacesOn(r.data!.available);
    setCandidates(r.data!.candidates);
  });

  const save = () => startSave(async () => {
    const r = await confirmReviewAction({
      submissionId: s.id, name, category, description: description || undefined, address: address || undefined,
      visitMinutes: visit ? Number(visit) : undefined,
      candidate: pin.kind === "candidate" ? { googlePlaceId: pin.c.googlePlaceId, name: pin.c.name, address: pin.c.address, lat: pin.c.lat, lng: pin.c.lng, openingHours: pin.c.openingHours } : undefined,
      useExtractedLocation: pin.kind === "link",
    });
    if (!r.ok) return void toast.error((t.errors as Record<string, string>)[r.error] ?? t.errors.generic);
    toast.success(r.data?.merged ? t.review.merged : t.review.confirmed);
    setOpen(false);
    router.refresh();
  });

  const option = (active: boolean) => cn("w-full rounded-xl border p-3 text-left text-sm transition", active ? "border-primary bg-accent" : "hover:bg-muted");

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-2xl border bg-background p-5 shadow-xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold">{t.review.title}</Dialog.Title>
            <Dialog.Close asChild><Button variant="ghost" size="icon" aria-label={t.cancel}><X /></Button></Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">{t.review.title}</Dialog.Description>

          {ex?.isMock && <p className="mb-3 rounded-lg bg-fuchsia-50 p-2 text-xs text-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-200">{t.inbox.mock}</p>}
          {s.meta.blockedByPlatform && <p className="mb-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">{t.inbox.restricted}</p>}
          {s.meta.title && <p className="mb-3 line-clamp-3 text-xs text-muted-foreground">{t.review.evidence}: {s.meta.title}</p>}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rv-name">{t.review.name}</Label>
              <Input id="rv-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="rv-cat">{t.review.category}</Label>
                <Select id="rv-cat" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{t.category[c]}</option>)}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rv-visit">{t.review.visit}</Label>
                <Input id="rv-visit" type="number" min={5} max={1440} value={visit} onChange={(e) => setVisit(e.target.value)} />
              </div>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{t.review.pick}</legend>
              <div className="flex gap-2">
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.review.searchPh}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); search(); } }} />
                <Button type="button" variant="secondary" onClick={search} disabled={searching}><Search />{t.review.search}</Button>
              </div>
              {!placesOn && <p className="text-xs text-muted-foreground">{t.review.placesOff}</p>}
              {searching && <p className="text-xs text-muted-foreground">{t.review.searching}</p>}
              {placesOn && !searching && candidates.length === 0 && query && <p className="text-xs text-muted-foreground">{t.review.noResults}</p>}
              <div className="space-y-2">
                {candidates.map((c) => (
                  <button key={c.googlePlaceId} type="button" className={option(pin.kind === "candidate" && pin.c.googlePlaceId === c.googlePlaceId)}
                    onClick={() => { setPin({ kind: "candidate", c }); if (!name) setName(c.name); if (c.address) setAddress(c.address); }}>
                    <span className="flex items-center gap-2 font-medium"><MapPin className="h-4 w-4 text-primary" />{c.name}</span>
                    {c.address && <span className="block text-xs text-muted-foreground">{c.address}</span>}
                  </button>
                ))}
                {hasLinkPin && (
                  <button type="button" className={option(pin.kind === "link")} onClick={() => setPin({ kind: "link" })}>
                    <span className="font-medium">{t.review.useLinkLocation}</span>
                    <span className="block text-xs text-muted-foreground">{ex!.latitude!.toFixed(5)}, {ex!.longitude!.toFixed(5)}</span>
                  </button>
                )}
                <button type="button" className={option(pin.kind === "none")} onClick={() => setPin({ kind: "none" })}>{t.review.noPin}</button>
              </div>
            </fieldset>

            <div className="space-y-2">
              <Label htmlFor="rv-addr">{t.review.address}</Label>
              <Input id="rv-addr" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rv-desc">{t.review.description}</Label>
              <Textarea id="rv-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
            </div>
            {ex?.missingFields?.length ? <p className="text-xs text-muted-foreground">{t.inbox.missing}: {ex.missingFields.join(", ")}</p> : null}
            <Button className="w-full" size="lg" onClick={save} disabled={saving || !name.trim()}>{t.review.confirm}</Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
