"use client";
import { useEffect } from "react";

/** Remembers the last opened trip so the mobile share sheet can drop links straight into it. */
export function RememberTrip({ tripId }: { tripId: string }) {
  useEffect(() => {
    document.cookie = `last_trip=${encodeURIComponent(tripId)}; path=/; max-age=${60 * 60 * 24 * 180}; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
  }, [tripId]);
  return null;
}
