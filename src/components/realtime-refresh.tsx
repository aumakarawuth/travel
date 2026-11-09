"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Subscribes to Postgres changes for one trip and refreshes server components.
 * Realtime respects RLS, so only rows the user may read are delivered.
 */
export function RealtimeRefresh({ tripId, tables }: { tripId: string; tables: string[] }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = tables.join(",");
  useEffect(() => {
    const supabase = createClient();
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 300); // debounce bursts
    };
    let channel = supabase.channel(`trip:${tripId}`);
    for (const table of key.split(",")) {
      const filter = table === "trips" ? `id=eq.${tripId}` : `trip_id=eq.${tripId}`;
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table, filter }, refresh);
    }
    channel.subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [tripId, key, router]);
  return null;
}
