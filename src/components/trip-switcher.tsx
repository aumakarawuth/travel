"use client";
import { useRouter } from "next/navigation";

export function TripSwitcher({ current, trips }: { current: string; trips: { id: string; name: string }[] }) {
  const router = useRouter();
  return (
    <select
      aria-label="Switch trip"
      value={current}
      onChange={(e) => router.push(e.target.value === "__all" ? "/trips" : `/trips/${e.target.value}`)}
      className="max-w-[60vw] truncate rounded-lg bg-transparent py-1 pr-6 text-lg font-bold tracking-tight focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {trips.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      <option value="__all">…</option>
    </select>
  );
}
