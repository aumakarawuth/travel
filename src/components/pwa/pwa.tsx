"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Registers the service worker in production only (dev HMR and SW caching don't mix). */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((e) => console.warn("sw register failed", e));
  }, []);
  return null;
}

const subscribe = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => { window.removeEventListener("online", cb); window.removeEventListener("offline", cb); };
};
export function useOnline() {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-amber-500 px-3 py-1.5 text-center text-xs font-medium text-amber-950">
      <WifiOff className="h-3.5 w-3.5 shrink-0" />
      ออฟไลน์ — แสดงข้อมูลที่บันทึกไว้ล่าสุด · การเพิ่มลิงก์ ค้นหาสถานที่ และคำนวณเส้นทางต้องใช้อินเทอร์เน็ต
    </div>
  );
}

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** "Install app" button — shown only when the browser offers installation (Chrome/Edge/Android). */
export function InstallButton({ label }: { label: string }) {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setEvt(e as BIPEvent); };
    window.addEventListener("beforeinstallprompt", h);
    window.addEventListener("appinstalled", () => setEvt(null));
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);
  if (!evt) return null;
  return (
    <Button variant="ghost" size="icon" aria-label={label} title={label}
      onClick={async () => { await evt.prompt(); await evt.userChoice; setEvt(null); }}>
      <Download />
    </Button>
  );
}

/** Lets the user wipe trip pages cached for offline reading. */
export function ClearOfflineCache({ label, done }: { label: string; done: string }) {
  const [msg, setMsg] = useState("");
  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={async () => {
        const reg = await navigator.serviceWorker?.getRegistration();
        reg?.active?.postMessage("clear-pages");
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k.startsWith("pages-")).map((k) => caches.delete(k)));
        setMsg(done);
      }}>{label}</Button>
      {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
    </div>
  );
}
