"use client";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ExternalLink, List, Map as MapIcon, MapPinOff, Navigation, Search, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Avatar, Badge, EmptyState, Skeleton } from "@/components/ui/misc";
import { CATEGORIES, type Category } from "@/lib/ai/schema";
import { CATEGORY_COLOR, CATEGORY_EMOJI } from "@/lib/categories";
import { directionsUrl, EMPTY_FILTERS, filterPlaces, placeMapsUrl, rankPlaces, splitPinnable, type ExplorePlace, type Filters, type Person, type PlaceStatus } from "@/lib/explore";
import { formatMoney, cn } from "@/lib/utils";
import type { Dict } from "@/i18n/th";
import { VoteButtons } from "./vote-buttons";
import { SelectionControls } from "./selection-controls";

const MapView = dynamic(() => import("./map-view").then((m) => m.MapView), { ssr: false, loading: () => <Skeleton className="h-full w-full" /> });

export type ExplorerT = {
  explore: Dict["explore"]; category: Dict["category"]; vote: Dict["vote"]; selection: Dict["selection"];
  priority: Dict["priority"]; errors: Dict["errors"];
};

export function Explorer({ tripId, places, members, meId, canEdit, locale, provider, t }:
  { tripId: string; places: ExplorePlace[]; members: Person[]; meId: string; canEdit: boolean; locale: "th" | "en"; provider: "google" | "osm"; t: ExplorerT }) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<"map" | "list">("map");
  const people = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m])), [members]);

  const filtered = useMemo(() => rankPlaces(filterPlaces(places, filters)), [places, filters]);
  const { pinned, unpinned } = useMemo(() => splitPinnable(filtered), [filtered]);
  const selected = places.find((p) => p.id === selectedId) ?? null;
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }));
  const active = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

  const select = (id: string) => {
    setSelectedId(id);
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      const p = places.find((x) => x.id === id);
      if (p && p.lat !== null && p.locationVerified) setView("map");
    }
  };

  if (!places.length) {
    return <EmptyState title={t.explore.empty} body={t.explore.emptyHint}
      action={<Button asChild><Link href={`/trips/${tripId}/inbox`}>{t.explore.emptyHint}</Link></Button>} />;
  }

  const chip = (on: boolean) => cn("whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition", on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent");

  return (
    <div className="space-y-3">
      {/* filters */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder={t.explore.search} value={filters.query} onChange={(e) => set("query", e.target.value)} aria-label={t.explore.search} />
          </div>
          <div className="flex rounded-xl border p-0.5 lg:hidden" role="tablist">
            <Button size="sm" variant={view === "map" ? "default" : "ghost"} onClick={() => setView("map")} aria-label={t.explore.map}><MapIcon /></Button>
            <Button size="sm" variant={view === "list" ? "default" : "ghost"} onClick={() => setView("list")} aria-label={t.explore.list}><List /></Button>
          </div>
        </div>
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
          {CATEGORIES.filter((c) => places.some((p) => p.category === c)).map((c) => {
            const on = filters.categories.includes(c);
            return (
              <button key={c} className={chip(on)} onClick={() => set("categories", on ? filters.categories.filter((x) => x !== c) : [...filters.categories, c])}>
                {CATEGORY_EMOJI[c]} {t.category[c]}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Select className="h-9" aria-label={t.explore.member} value={filters.memberId} onChange={(e) => set("memberId", e.target.value)}>
            <option value="all">{t.explore.member}: {t.explore.any}</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
          <Select className="h-9" aria-label={t.explore.status} value={filters.statuses[0] ?? ""} onChange={(e) => set("statuses", e.target.value ? [e.target.value as PlaceStatus] : [])}>
            <option value="">{t.explore.status}: {t.explore.any}</option>
            {(["proposed", "shortlisted", "selected", "rejected", "scheduled"] as const).map((s) => <option key={s} value={s}>{t.selection[s]}</option>)}
          </Select>
          <Select className="h-9" aria-label={t.explore.selection} value={filters.selection} onChange={(e) => set("selection", e.target.value as Filters["selection"])}>
            <option value="all">{t.explore.selection}: {t.explore.any}</option>
            <option value="selected">{t.explore.selected}</option>
            <option value="unselected">{t.explore.unselected}</option>
          </Select>
          <Input className="h-9" type="number" min={0} inputMode="numeric" placeholder={t.explore.budget} aria-label={t.explore.budget}
            value={filters.maxPrice ?? ""} onChange={(e) => set("maxPrice", e.target.value === "" ? null : Math.max(0, Number(e.target.value)))} />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{t.explore.showing} {filtered.length} {t.explore.of} {places.length} · {pinned.length} {t.explore.pinned}</span>
          {active && <button className="flex items-center gap-1 font-medium text-primary" onClick={() => setFilters(EMPTY_FILTERS)}><X className="h-3 w-3" />{t.explore.clear}</button>}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
        {/* map */}
        <div className={cn("space-y-2", view === "list" && "hidden lg:block")}>
          <div className="relative h-[55dvh] overflow-hidden rounded-2xl border lg:h-[70dvh]">
            <MapView places={pinned} selectedId={selectedId} onSelect={select} className="h-full w-full" />
          </div>
          {provider === "osm" && <p className="text-xs text-muted-foreground">{t.explore.osm}</p>}
          {selected && (
            <div className="lg:hidden">
              <PlaceCard p={selected} selected tripId={tripId} meId={meId} people={people} canEdit={canEdit} locale={locale} t={t} onSelect={() => {}} />
            </div>
          )}
        </div>

        {/* list */}
        <div className={cn("space-y-3 lg:max-h-[75dvh] lg:overflow-y-auto lg:pr-1", view === "map" && "hidden lg:block")}>
          {!filtered.length && <p className="py-8 text-center text-sm text-muted-foreground">{t.explore.noResults}</p>}
          {pinned.map((p) => (
            <PlaceCard key={p.id} p={p} selected={p.id === selectedId} tripId={tripId} meId={meId} people={people} canEdit={canEdit} locale={locale} t={t} onSelect={select} />
          ))}
          {unpinned.length > 0 && (
            <>
              <h3 className="flex items-center gap-1 pt-2 text-sm font-semibold text-muted-foreground"><MapPinOff className="h-4 w-4" />{t.explore.needsLocation} ({unpinned.length})</h3>
              {unpinned.map((p) => (
                <PlaceCard key={p.id} p={p} selected={p.id === selectedId} tripId={tripId} meId={meId} people={people} canEdit={canEdit} locale={locale} t={t} onSelect={select} />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PlaceCard({ p, selected, tripId, meId, people, canEdit, locale, t, onSelect }:
  { p: ExplorePlace; selected: boolean; tripId: string; meId: string; people: Record<string, Person>; canEdit: boolean; locale: "th" | "en"; t: ExplorerT; onSelect: (id: string) => void }) {
  const dir = directionsUrl(p);
  const price = formatMoney(p.price, p.currency ?? "THB", locale);
  return (
    <Card id={`place-${p.id}`} onClick={() => onSelect(p.id)}
      className={cn("cursor-pointer space-y-3 p-3 transition", selected ? "border-primary ring-2 ring-primary/30" : "hover:border-primary/40", p.status === "rejected" && "opacity-60")}>
      <div className="flex gap-3">
        {p.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.image.url} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" referrerPolicy="no-referrer" loading="lazy" />
        ) : (
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl text-2xl" style={{ backgroundColor: CATEGORY_COLOR[p.category] + "22" }}>{CATEGORY_EMOJI[p.category]}</span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <p className="flex-1 truncate font-medium">{p.name}</p>
            {p.priority === "must_visit" && <Badge className="border-rose-300 text-rose-600">{t.priority.must_visit}</Badge>}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            <span style={{ color: CATEGORY_COLOR[p.category] }}>●</span> {t.category[p.category as Category]}{price && ` · ${price}`}{p.address && ` · ${p.address}`}
          </p>
          {selected && p.description && <p className="mt-1 text-xs">{p.description}</p>}
          <div className="mt-1 flex -space-x-1.5">
            {p.submitters.map((s) => <Avatar key={s.id} name={s.name} url={s.avatar} color={s.color} size={20} />)}
          </div>
        </div>
      </div>
      <VoteButtons placeId={p.id} votes={p.votes} meId={meId} people={people} t={t.vote} compact={!selected} />
      {selected && <SelectionControls placeId={p.id} status={p.status} priority={p.priority} canEdit={canEdit} t={{ selection: t.selection, priority: t.priority, errors: t.errors }} />}
      <div className="flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
        <Button size="sm" variant="secondary" asChild><Link href={`/trips/${tripId}/places/${p.id}`}>{t.explore.details}</Link></Button>
        {dir && <Button size="sm" variant="outline" asChild><a href={dir} target="_blank" rel="noopener noreferrer"><Navigation />{t.explore.navigate}</a></Button>}
        {selected && <Button size="sm" variant="ghost" asChild><a href={placeMapsUrl(p)} target="_blank" rel="noopener noreferrer"><ExternalLink />{t.explore.openMaps}</a></Button>}
        {selected && p.sourceUrls[0] && <Button size="sm" variant="ghost" asChild><a href={p.sourceUrls[0]} target="_blank" rel="noopener noreferrer nofollow"><ExternalLink />{t.explore.source}</a></Button>}
      </div>
    </Card>
  );
}
