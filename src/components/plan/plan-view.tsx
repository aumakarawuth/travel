"use client";
import { useMemo, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, CloudRain, Copy, ExternalLink, GripVertical, Lock, Map as MapIcon, Share2, Sparkles, Unlock, Utensils, BedDouble } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge, EmptyState, Skeleton } from "@/components/ui/misc";
import { activateVersionAction, generatePlanAction, saveManualPlanAction } from "@/app/actions/plan";
import { directionsSegments, durationText, hhmm, thaiDaySummary, type RoutePoint } from "@/lib/planner/links";
import type { StoredPlan } from "@/lib/planner/run";
import type { DayPlan, Stop } from "@/lib/planner/types";
import { CATEGORY_EMOJI } from "@/lib/categories";
import { formatMoney, cn } from "@/lib/utils";
import type { Category } from "@/lib/ai/schema";
import type { Dict } from "@/i18n/th";

const MapView = dynamic(() => import("@/components/explore/map-view").then((m) => m.MapView), { ssr: false, loading: () => <Skeleton className="h-full w-full" /> });

export type PlanT = { plan: Dict["plan"]; reason: Dict["reason"]; note: Dict["note"]; warn: Dict["warn"]; explainCode: Dict["explainCode"]; errors: Dict["errors"] };
type Version = { id: string; version: number; label: string | null; createdAt: string; active: boolean };
type PlaceStop = Extract<Stop, { kind: "place" }>;

function fill(tpl: string, vals: Record<string, string>) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vals[k] ?? "");
}
function explainLine(code: string, t: PlanT) {
  const [k, ...rest] = code.split(":");
  const tpl = (t.explainCode as Record<string, string>)[k];
  if (!tpl) return null;
  return fill(tpl, { n: rest.join(":"), a: rest[0] ?? "", b: rest[1] ?? "" });
}
function warnLine(code: string, t: PlanT) {
  const [k, ...rest] = code.split(":");
  const base = (t.warn as Record<string, string>)[k] ?? k;
  return rest.length ? `${base}: ${rest.join(":")}` : base;
}

export function PlanView({ tripId, plan, versions, canEdit, selectedCount, locale, dateLabels, t }:
  { tripId: string; plan: StoredPlan | null; versions: Version[]; canEdit: boolean; selectedCount: number; locale: "th" | "en"; dateLabels: Record<string, string>; t: PlanT }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({ mealMinutes: plan?.settings.mealMinutes ?? 60, trafficBufferPct: plan?.settings.trafficBufferPct ?? 15, legBufferMinutes: plan?.settings.legBufferMinutes ?? 10 });

  const initialOrder = useMemo(() => Object.fromEntries((plan?.days ?? []).map((d) => [d.date, d.stops.filter((s): s is PlaceStop => s.kind === "place").map((s) => s.placeId)])), [plan]);
  const initialLockedStops = useMemo(() => (plan?.days ?? []).flatMap((d) => d.stops.filter((s): s is PlaceStop => s.kind === "place" && s.locked).map((s) => s.placeId)), [plan]);
  const [order, setOrder] = useState<Record<string, string[]>>(initialOrder);
  const [lockedDays, setLockedDays] = useState<string[]>((plan?.days ?? []).filter((d) => d.locked).map((d) => d.date));
  const [lockedStops, setLockedStops] = useState<string[]>(initialLockedStops);
  const [dirty, setDirty] = useState(false);
  const [drag, setDrag] = useState<{ id: string; from: string } | null>(null);

  const names = useMemo(() => Object.fromEntries((plan?.days ?? []).flatMap((d) => d.stops.filter((s): s is PlaceStop => s.kind === "place").map((s) => [s.placeId, s.name]))
    .concat((plan?.unscheduled ?? []).map((u) => [u.placeId, u.name]))), [plan]);

  const err = (e: string) => toast.error((t.errors as Record<string, string>)[e] ?? t.errors.generic);
  const generate = () => start(async () => {
    const r = await generatePlanAction(tripId, settings);
    if (!r.ok) return void err(r.error);
    toast.success(`${t.plan.saved} (${t.plan.version} ${r.data?.version})`);
    setDirty(false); router.refresh();
  });
  const save = () => start(async () => {
    const r = await saveManualPlanAction({ tripId, order, lockedDays, lockedStops });
    if (!r.ok) return void err(r.error);
    toast.success(t.plan.saved); setDirty(false); router.refresh();
  });
  const mutate = (fn: (o: Record<string, string[]>) => Record<string, string[]>) => { setOrder((o) => fn(structuredClone(o))); setDirty(true); };
  const move = (id: string, from: string, to: string, index?: number) => mutate((o) => {
    o[from] = o[from].filter((x) => x !== id);
    const list = o[to] ?? [];
    list.splice(index ?? list.length, 0, id);
    o[to] = list;
    return o;
  });
  const shift = (date: string, i: number, delta: number) => mutate((o) => {
    const l = o[date]; const j = i + delta;
    if (j < 0 || j >= l.length) return o;
    [l[i], l[j]] = [l[j], l[i]];
    return o;
  });

  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); toast.success(t.plan.copied); } catch { toast.error(text.slice(0, 80)); } };
  const routePoints = (d: DayPlan): RoutePoint[] => [
    ...(d.startPoint ? [{ ...d.startPoint }] : []),
    ...d.stops.filter((s): s is PlaceStop => s.kind === "place").map((s) => ({ ...plan!.placeMeta[s.placeId], name: s.name, placeId: plan!.placeMeta[s.placeId]?.googlePlaceId })),
    ...(d.endPoint ? [{ ...d.endPoint }] : []),
  ].filter((p) => p && typeof p.lat === "number");

  const tripSummary = () => (plan?.days ?? []).map((d, i) => thaiDaySummary(i, d)).join("\n");

  return (
    <div className="space-y-4">
      {/* toolbar */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && <Button onClick={generate} disabled={pending || selectedCount === 0}><Sparkles />{pending ? t.plan.generating : plan ? t.plan.regenerate : t.plan.generate}</Button>}
          {canEdit && <Button variant="ghost" size="sm" onClick={() => setShowSettings(!showSettings)}>{t.plan.settings}</Button>}
          {plan && <Button variant="outline" size="sm" onClick={async () => {
            const text = tripSummary();
            if (navigator.share) { try { await navigator.share({ title: "TripSync", text }); } catch { /* cancelled */ } } else copy(text);
          }}><Share2 />{t.plan.shareTrip}</Button>}
          {versions.length > 0 && <span className="ml-auto text-xs text-muted-foreground">{t.plan.version} {versions.find((v) => v.active)?.version}</span>}
        </div>
        {showSettings && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {([["mealMinutes", t.plan.meal], ["trafficBufferPct", t.plan.traffic], ["legBufferMinutes", t.plan.legBuffer]] as const).map(([k, label]) => (
              <div key={k} className="space-y-1">
                <Label htmlFor={k} className="text-xs">{label}</Label>
                <Input id={k} type="number" min={0} max={180} value={settings[k]} onChange={(e) => setSettings({ ...settings, [k]: Number(e.target.value) })} />
              </div>
            ))}
          </div>
        )}
        {selectedCount === 0 && <p className="mt-2 text-sm text-muted-foreground">{t.plan.noSelected} — <Link className="text-primary" href={`/trips/${tripId}/map`}>{t.plan.emptyHint}</Link></p>}
      </Card>

      {!plan ? <EmptyState icon={<Sparkles />} title={t.plan.empty} body={t.plan.emptyHint} /> : (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Card className="p-3"><p className="text-xs text-muted-foreground">{t.plan.totalTravel}</p><p className="font-semibold">{durationText(plan.totals.travelMinutes, locale)}</p></Card>
            <Card className="p-3"><p className="text-xs text-muted-foreground">{t.plan.totalVisit}</p><p className="font-semibold">{durationText(plan.totals.visitMinutes, locale)}</p></Card>
            <Card className="p-3"><p className="text-xs text-muted-foreground">{t.plan.totalCost}</p><p className="font-semibold">{formatMoney(plan.totals.cost, "THB", locale) ?? "—"}</p></Card>
          </div>
          <p className={cn("rounded-xl p-3 text-xs", plan.routingSource === "estimate" ? "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200" : "bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200")}>
            {plan.routingSource === "estimate" ? t.plan.routingEstimate : t.plan.routingGoogle}
          </p>
          {plan.warnings.length > 0 && <ul className="space-y-1 text-xs text-amber-800 dark:text-amber-300">{plan.warnings.map((w) => <li key={w}>⚠️ {warnLine(w, t)}</li>)}</ul>}

          {dirty && (
            <div className="sticky top-16 z-20 flex items-center justify-between gap-2 rounded-xl border border-primary bg-background p-3 shadow">
              <span className="text-sm">{t.plan.unsaved}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => { setOrder(initialOrder); setLockedStops(initialLockedStops); setDirty(false); }}>↺</Button>
                <Button size="sm" onClick={save} disabled={pending}>{t.plan.saveOrder}</Button>
              </div>
            </div>
          )}

          {plan.days.map((d, i) => (
            <DayCard key={d.date} index={i} day={d} label={dateLabels[d.date] ?? d.date} plan={plan} t={t} locale={locale} canEdit={canEdit} dirty={dirty}
              ids={order[d.date] ?? []} names={names} allDates={plan.days.map((x) => x.date)} dateLabels={dateLabels}
              dayLocked={lockedDays.includes(d.date)} lockedStops={lockedStops}
              onToggleDayLock={() => { setLockedDays((l) => (l.includes(d.date) ? l.filter((x) => x !== d.date) : [...l, d.date])); setDirty(true); }}
              onToggleStopLock={(id) => { setLockedStops((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id])); setDirty(true); }}
              onShift={(idx, delta) => shift(d.date, idx, delta)} onMove={(id, to) => move(id, d.date, to)}
              drag={drag} setDrag={setDrag} onDrop={(index) => { if (drag) move(drag.id, drag.from, d.date, index); setDrag(null); }}
              copy={copy} routeUrls={directionsSegments(routePoints(d), plan.settings.travelMode)} points={routePoints(d)} />
          ))}

          {plan.unscheduled.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">{t.plan.unscheduled} ({plan.unscheduled.length})</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {plan.unscheduled.map((u) => (
                  <div key={u.placeId} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/trips/${tripId}/places/${u.placeId}`} className="truncate hover:underline">{u.name}</Link>
                    <span className="shrink-0 text-xs text-muted-foreground">{t.reason[u.reason]}</span>
                    {canEdit && plan.days.length > 0 && plan.placeMeta[u.placeId] && (
                      <Select aria-label={t.plan.moveTo} className="h-8 w-28 text-xs" value="" onChange={(e) => { if (e.target.value) mutate((o) => { o[e.target.value] = [...(o[e.target.value] ?? []), u.placeId]; return o; }); }}>
                        <option value="">{t.plan.moveTo}…</option>
                        {plan.days.map((x) => <option key={x.date} value={x.date}>{dateLabels[x.date]}</option>)}
                      </Select>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {versions.length > 1 && (
            <details className="rounded-xl border p-3 text-sm">
              <summary className="cursor-pointer font-medium">{t.plan.versions}</summary>
              <ul className="mt-2 space-y-1">
                {versions.map((v) => (
                  <li key={v.id} className="flex items-center justify-between">
                    <span>{t.plan.version} {v.version} · {v.label === "manual" ? t.plan.manual : t.plan.auto} · {new Date(v.createdAt).toLocaleString(locale === "th" ? "th-TH" : "en-GB")}</span>
                    {v.active ? <Badge>✓</Badge> : canEdit && <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => { const r = await activateVersionAction(tripId, v.id); if (!r.ok) err(r.error); router.refresh(); })}>{t.plan.activate}</Button>}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

function DayCard(props: {
  index: number; day: DayPlan; label: string; plan: StoredPlan; t: PlanT; locale: "th" | "en"; canEdit: boolean; dirty: boolean;
  ids: string[]; names: Record<string, string>; allDates: string[]; dateLabels: Record<string, string>;
  dayLocked: boolean; lockedStops: string[]; onToggleDayLock: () => void; onToggleStopLock: (id: string) => void;
  onShift: (i: number, d: number) => void; onMove: (id: string, to: string) => void;
  drag: { id: string; from: string } | null; setDrag: (d: { id: string; from: string } | null) => void; onDrop: (index?: number) => void;
  copy: (s: string) => void; routeUrls: string[]; points: RoutePoint[];
}) {
  const { index, day: d, label, plan, t, locale, canEdit, dirty, ids, names } = props;
  const [showMap, setShowMap] = useState(false);
  const [rain, setRain] = useState(false);
  const summary = thaiDaySummary(index, d);
  const byId = new Map(d.stops.filter((s): s is PlaceStop => s.kind === "place").map((s) => [s.placeId, s]));
  const mapPlaces = ids.filter((id) => plan.placeMeta[id]).map((id) => ({ id, name: names[id], category: plan.placeMeta[id].category as Category, lat: plan.placeMeta[id].lat, lng: plan.placeMeta[id].lng }));
  const labels = Object.fromEntries(ids.map((id, i) => [id, String(i + 1)]));

  return (
    <Card className={cn(!d.feasible && "border-amber-400")}>
      <CardHeader className="gap-2">
        <div className="flex items-center gap-2">
          <CardTitle className="flex-1">{t.plan.day} {index + 1} · {label}</CardTitle>
          {d.feasible ? <Badge className="border-emerald-300 text-emerald-700"><CheckCircle2 className="mr-1 h-3 w-3" />{t.plan.feasible}</Badge>
            : <Badge className="border-amber-400 text-amber-700"><AlertTriangle className="mr-1 h-3 w-3" />{t.plan.infeasible}</Badge>}
          {canEdit && <Button size="icon" variant="ghost" aria-label={props.dayLocked ? t.plan.unlockDay : t.plan.lockDay} onClick={props.onToggleDayLock}>{props.dayLocked ? <Lock /> : <Unlock />}</Button>}
        </div>
        <p className="text-sm">{summary}</p>
        <p className="text-xs text-muted-foreground">
          {t.plan.depart} {hhmm(d.start)} · {t.plan.finish} {hhmm(d.finish)} · {t.plan.travel} {durationText(d.travelMinutes, locale)} · {t.plan.visit} {durationText(d.visitMinutes, locale)}
          {d.cost > 0 && ` · ${formatMoney(d.cost, "THB", locale)}`}
        </p>
        {d.warnings.length > 0 && <p className="text-xs text-amber-700 dark:text-amber-300">⚠️ {d.warnings.map((w) => warnLine(w, t)).join(" · ")}</p>}
        <div className="flex flex-wrap gap-1.5">
          {props.routeUrls.map((u, i) => (
            <Button key={u} size="sm" variant="secondary" asChild><a href={u} target="_blank" rel="noopener noreferrer"><ExternalLink />{t.plan.openMaps}{props.routeUrls.length > 1 && ` (${t.plan.part} ${i + 1})`}</a></Button>
          ))}
          {props.routeUrls.length > 0 && <Button size="sm" variant="outline" onClick={() => props.copy(props.routeUrls.join("\n"))}><Copy />{t.plan.copyRoute}</Button>}
          <Button size="sm" variant="outline" onClick={() => props.copy(summary)}><Copy />{t.plan.copySummary}</Button>
          <Button size="sm" variant={showMap ? "default" : "ghost"} aria-label="Map" aria-pressed={showMap} onClick={() => setShowMap(!showMap)}><MapIcon /></Button>
          <Button size="sm" variant={rain ? "default" : "ghost"} onClick={() => setRain(!rain)} aria-pressed={rain}><CloudRain />{t.plan.rain}</Button>
        </div>
        {props.routeUrls.length > 1 && <p className="text-xs text-muted-foreground">{t.plan.waypointNote}</p>}
      </CardHeader>
      <CardContent className="space-y-2">
        {showMap && mapPlaces.length > 0 && (
          <div className="space-y-1">
            <div className="h-64 overflow-hidden rounded-xl border"><MapView places={mapPlaces} selectedId={null} onSelect={() => {}} route={props.points} labels={labels} className="h-full w-full" /></div>
            <p className="text-xs text-muted-foreground">{t.plan.straight}</p>
          </div>
        )}
        {rain ? (
          <div className="rounded-xl bg-sky-50 p-3 text-sm dark:bg-sky-950">
            <p className="text-xs text-muted-foreground">{t.plan.rainHint}</p>
            {d.rainPlan?.length ? <ol className="mt-1 list-decimal pl-5">{d.rainPlan.map((id) => <li key={id}>{names[id]}</li>)}</ol> : <p className="mt-1">{t.plan.noRain}</p>}
          </div>
        ) : (
          <ol className="space-y-2" onDragOver={(e) => e.preventDefault()} onDrop={() => props.onDrop()}>
            {!dirty && d.stops.filter((s) => s.kind === "meal").length > 0 && null}
            {(dirty ? ids.map((id) => ({ id, s: byId.get(id) })) : d.stops.map((s) => ({ id: s.kind === "place" ? s.placeId : `${s.kind}-${"label" in s ? s.label : s.arrive}`, s }))).map(({ id, s }, i) => {
              if (s && s.kind === "meal") return (
                <li key={id} className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground"><Utensils className="h-4 w-4" />{hhmm(s.arrive)}–{hhmm(s.depart)} {s.label === "lunch" ? t.plan.lunch : t.plan.dinner}</li>
              );
              if (s && s.kind === "hotel") return (
                <li key={id} className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-xs"><BedDouble className="h-4 w-4" />{hhmm(s.arrive)} {t.plan.backHotel} {s.name} · {t.plan.travel} {durationText(s.travel.minutes, locale)}{s.travel.estimate && "*"}</li>
              );
              const p = s as PlaceStop | undefined;
              const pos = ids.indexOf(id);
              const locked = props.lockedStops.includes(id) || props.dayLocked;
              const meta = plan.placeMeta[id];
              return (
                <li key={id} draggable={canEdit && !props.dayLocked}
                  onDragStart={() => props.setDrag({ id, from: d.date })} onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.stopPropagation(); props.onDrop(pos); }}
                  className={cn("rounded-xl border p-3", props.drag?.id === id && "opacity-50")}>
                  <div className="flex items-start gap-2">
                    {canEdit && <GripVertical className="mt-0.5 h-4 w-4 shrink-0 cursor-grab text-muted-foreground" aria-hidden />}
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{pos + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{meta && CATEGORY_EMOJI[meta.category as Category]} {names[id] ?? id}</p>
                      {p && !dirty ? (
                        <p className="text-xs text-muted-foreground">
                          {t.plan.travel} {durationText(p.travel.minutes, locale)}{p.travel.estimate && "*"} ({(p.travel.meters / 1000).toFixed(1)} km) · {t.plan.arrive} {hhmm(p.arrive)}
                          {p.wait > 0 && ` · ${t.plan.wait} ${durationText(p.wait, locale)}`} · {t.plan.visit} {durationText(p.visit, locale)} · {t.plan.leave} {hhmm(p.depart)}
                          {p.cost !== null && ` · ${formatMoney(p.cost, "THB", locale)}`}
                        </p>
                      ) : <p className="text-xs text-muted-foreground">{t.plan.unsaved}</p>}
                      {p && !dirty && p.notes.length > 0 && <p className="text-xs text-amber-700 dark:text-amber-300">{p.notes.map((n) => (t.note as Record<string, string>)[n] ?? n).join(" · ")}</p>}
                      {meta?.sourceUrl && <a href={meta.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-xs text-primary hover:underline">↗ {new URL(meta.sourceUrl).hostname}</a>}
                    </div>
                    {canEdit && (
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <div className="flex">
                          <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={t.plan.up} disabled={pos <= 0 || props.dayLocked} onClick={() => props.onShift(pos, -1)}><ArrowUp /></Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={t.plan.down} disabled={pos >= ids.length - 1 || props.dayLocked} onClick={() => props.onShift(pos, 1)}><ArrowDown /></Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={locked ? t.plan.unlock : t.plan.lock} disabled={props.dayLocked} onClick={() => props.onToggleStopLock(id)}>{locked ? <Lock /> : <Unlock />}</Button>
                        </div>
                        {props.allDates.length > 1 && !props.dayLocked && (
                          <Select aria-label={t.plan.moveTo} className="h-8 w-28 text-xs" value={d.date} onChange={(e) => props.onMove(id, e.target.value)}>
                            {props.allDates.map((x) => <option key={x} value={x}>{props.dateLabels[x]}</option>)}
                          </Select>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">{t.plan.explain}</summary>
          <ul className="mt-1 list-disc pl-5">{d.explanation.map((c) => explainLine(c, t)).filter(Boolean).map((l) => <li key={l}>{l}</li>)}</ul>
        </details>
      </CardContent>
    </Card>
  );
}
