"use client";
import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { CATEGORY_COLOR, CATEGORY_EMOJI } from "@/lib/categories";
import type { ExplorePlace } from "@/lib/explore";

type Props = { places: ExplorePlace[]; selectedId: string | null; onSelect: (id: string) => void; className?: string };

const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
const DEFAULT_CENTER = { lat: 13.7563, lng: 100.5018 }; // Bangkok when nothing is pinned

export function mapProvider(): "google" | "osm" {
  return GOOGLE_KEY ? "google" : "osm";
}

/** Pin markup is built only from our own constants (never user text) → no HTML injection. */
function pinHtml(p: ExplorePlace, selected: boolean) {
  const c = CATEGORY_COLOR[p.category];
  const size = selected ? 40 : 32;
  return `<div style="width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${c};border:3px solid ${selected ? "#111" : "#fff"};box-shadow:0 2px 6px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center"><span style="transform:rotate(45deg);font-size:${selected ? 18 : 14}px">${CATEGORY_EMOJI[p.category]}</span></div>`;
}

export function MapView(props: Props) {
  return GOOGLE_KEY ? <GoogleMap {...props} apiKey={GOOGLE_KEY} /> : <LeafletMap {...props} />;
}

function LeafletMap({ places, selectedId, onSelect, className }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const state = useRef<{ map?: import("leaflet").Map; layer?: import("leaflet").MarkerClusterGroup; L?: typeof import("leaflet"); fitted?: string }>({});
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet.markercluster");
      if (cancelled || !el.current || state.current.map) return;
      const map = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lng], 6);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      const layer = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 50 });
      map.addLayer(layer);
      state.current = { map, layer, L };
      draw();
    })();
    return () => { cancelled = true; state.current.map?.remove(); state.current = {}; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function draw() {
    const { map, layer, L } = state.current;
    if (!map || !layer || !L) return;
    layer.clearLayers();
    for (const p of places) {
      const icon = L.divIcon({ html: pinHtml(p, p.id === selectedId), className: "", iconSize: [32, 32], iconAnchor: [16, 32] });
      L.marker([p.lat!, p.lng!], { icon, title: p.name, keyboard: true }).on("click", () => onSelectRef.current(p.id)).addTo(layer);
    }
    const key = places.map((p) => p.id).join();
    if (places.length && state.current.fitted !== key) {
      map.fitBounds(L.latLngBounds(places.map((p) => [p.lat!, p.lng!])), { padding: [40, 40], maxZoom: 15 });
      state.current.fitted = key;
    }
  }

  useEffect(draw); // redraw when places / selection change

  useEffect(() => {
    const p = places.find((x) => x.id === selectedId);
    if (p && state.current.map) state.current.map.panTo([p.lat!, p.lng!]);
  }, [selectedId, places]);

  return (
<div ref={el} className={className} role="region" aria-label="Map" />
  );
}

function GoogleMap({ places, selectedId, onSelect, className, apiKey }: Props & { apiKey: string }) {
  const el = useRef<HTMLDivElement>(null);
  const state = useRef<{ map?: google.maps.Map; clusterer?: import("@googlemaps/markerclusterer").MarkerClusterer; fitted?: string; ready?: boolean }>({});
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { Loader } = await import("@googlemaps/js-api-loader");
      const { MarkerClusterer } = await import("@googlemaps/markerclusterer");
      const loader = new Loader({ apiKey, version: "weekly", language: "th", region: "TH" });
      const { Map } = await loader.importLibrary("maps");
      await loader.importLibrary("marker");
      if (cancelled || !el.current) return;
      const map = new Map(el.current, {
        center: DEFAULT_CENTER, zoom: 6, mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID",
        streetViewControl: false, mapTypeControl: false, fullscreenControl: false, clickableIcons: false,
      });
      state.current = { map, clusterer: new MarkerClusterer({ map }), ready: true };
      draw();
    })();
    return () => { cancelled = true; state.current.clusterer?.clearMarkers(); state.current = {}; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  function draw() {
    const { map, clusterer } = state.current;
    if (!map || !clusterer) return;
    clusterer.clearMarkers();
    const markers = places.map((p) => {
      const content = document.createElement("div");
      content.innerHTML = pinHtml(p, p.id === selectedId);
      const m = new google.maps.marker.AdvancedMarkerElement({ position: { lat: p.lat!, lng: p.lng! }, content, title: p.name, gmpClickable: true });
      m.addListener("click", () => onSelectRef.current(p.id));
      return m;
    });
    clusterer.addMarkers(markers);
    const key = places.map((p) => p.id).join();
    if (places.length && state.current.fitted !== key) {
      const b = new google.maps.LatLngBounds();
      places.forEach((p) => b.extend({ lat: p.lat!, lng: p.lng! }));
      map.fitBounds(b, 60);
      if (places.length === 1) map.setZoom(15);
      state.current.fitted = key;
    }
  }

  useEffect(draw);
  useEffect(() => {
    const p = places.find((x) => x.id === selectedId);
    if (p && state.current.map) state.current.map.panTo({ lat: p.lat!, lng: p.lng! });
  }, [selectedId, places]);

  return <div ref={el} className={className} role="region" aria-label="Map" />;
}
