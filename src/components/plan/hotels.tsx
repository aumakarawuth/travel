"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BedDouble, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/misc";
import { deleteHotelAction, saveHotelAction, setHotelStatusAction } from "@/app/actions/plan";
import { formatMoney } from "@/lib/utils";
import type { Dict } from "@/i18n/th";

export type HotelView = { id: string; name: string; checkIn: string; checkOut: string; price: number | null; currency: string; rooms: number; status: "proposed" | "confirmed"; hasCoords: boolean; ref: string | null };

export function Hotels({ tripId, hotels, candidates, startDate, endDate, canEdit, locale, t, errors }:
  { tripId: string; hotels: HotelView[]; candidates: { id: string; name: string }[]; startDate: string; endDate: string; canEdit: boolean; locale: "th" | "en"; t: Dict["hotel"]; errors: Dict["errors"] }) {
  const [open, setOpen] = useState(false);
  const [placeId, setPlaceId] = useState("");
  const [name, setName] = useState("");
  const [checkIn, setCheckIn] = useState(startDate);
  const [checkOut, setCheckOut] = useState(endDate > startDate ? endDate : startDate);
  const [price, setPrice] = useState("");
  const [rooms, setRooms] = useState("1");
  const [pending, start] = useTransition();
  const router = useRouter();
  const fail = (e: string) => toast.error((errors as Record<string, string>)[e] ?? errors.generic);
  const nights = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2"><BedDouble className="h-5 w-5" />{t.title}</CardTitle>
        <Button size="sm" variant="outline" onClick={() => setOpen(!open)}><Plus />{t.add}</Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">{t.hint}</p>
        {open && (
          <form className="space-y-3 rounded-xl border p-3" onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await saveHotelAction({ tripId, placeId: placeId || undefined, name: placeId ? candidates.find((c) => c.id === placeId)!.name : name,
                checkIn, checkOut, pricePerNight: price ? Number(price) : undefined, rooms: Number(rooms) || 1, status: "proposed" });
              if (!r.ok) return void fail(r.error);
              setOpen(false); setName(""); setPlaceId(""); setPrice(""); router.refresh();
            });
          }}>
            {candidates.length > 0 && (
              <div className="space-y-1">
                <Label htmlFor="h-place">{t.fromPlace}</Label>
                <Select id="h-place" value={placeId} onChange={(e) => setPlaceId(e.target.value)}>
                  <option value="">—</option>
                  {candidates.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>
            )}
            {!placeId && (
              <div className="space-y-1">
                <Label htmlFor="h-name">{candidates.length ? t.orName : t.name}</Label>
                <Input id="h-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required={!placeId} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><Label htmlFor="h-in">{t.checkIn}</Label><Input id="h-in" type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} required /></div>
              <div className="space-y-1"><Label htmlFor="h-out">{t.checkOut}</Label><Input id="h-out" type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} required /></div>
              <div className="space-y-1"><Label htmlFor="h-price">{t.price}</Label><Input id="h-price" type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} /></div>
              <div className="space-y-1"><Label htmlFor="h-rooms">{t.rooms}</Label><Input id="h-rooms" type="number" min={1} max={50} value={rooms} onChange={(e) => setRooms(e.target.value)} /></div>
            </div>
            <Button className="w-full" disabled={pending}>{t.add}</Button>
          </form>
        )}
        {!hotels.length && <p className="text-sm text-muted-foreground">{t.empty}</p>}
        {hotels.map((h) => (
          <div key={h.id} className="flex flex-wrap items-center gap-2 rounded-xl border p-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{h.name} <Badge className={h.status === "confirmed" ? "border-emerald-300 text-emerald-700" : ""}>{t[h.status]}</Badge></p>
              <p className="text-xs text-muted-foreground">
                {h.checkIn} → {h.checkOut} · {nights(h.checkIn, h.checkOut)} {t.nights} · {h.rooms} {t.rooms}
                {h.price !== null && ` · ${formatMoney(h.price, h.currency, locale)}/${t.nights}`}
              </p>
              {!h.hasCoords && <p className="text-xs text-amber-700 dark:text-amber-300">{t.noCoords}</p>}
            </div>
            {canEdit && (
              <Button size="sm" variant="outline" disabled={pending}
                onClick={() => start(async () => { const r = await setHotelStatusAction(h.id, h.status === "confirmed" ? "proposed" : "confirmed"); if (!r.ok) fail(r.error); router.refresh(); })}>
                {h.status === "confirmed" ? t.unconfirm : t.confirm}
              </Button>
            )}
            <Button size="icon" variant="ghost" aria-label={t.delete} disabled={pending}
              onClick={() => start(async () => { const r = await deleteHotelAction(h.id); if (!r.ok) fail(r.error); router.refresh(); })}><Trash2 /></Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
