"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Inbox, Map, CalendarRange, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { key: "home", href: "", icon: Home },
  { key: "inbox", href: "/inbox", icon: Inbox },
  { key: "map", href: "/map", icon: Map },
  { key: "plan", href: "/plan", icon: CalendarRange },
  { key: "members", href: "/members", icon: Users },
] as const;

export function TripNav({ tripId, labels }: { tripId: string; labels: Record<(typeof ITEMS)[number]["key"], string> }) {
  const path = usePathname();
  const base = `/trips/${tripId}`;
  const isActive = (href: string) => (href === "" ? path === base : path.startsWith(base + href));
  return (
    <>
      {/* desktop tabs */}
      <nav className="hidden border-b md:block">
        <div className="container flex gap-1">
          {ITEMS.map(({ key, href, icon: Icon }) => (
            <Link key={key} href={base + href}
              className={cn("flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition",
                isActive(href) ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
              <Icon className="h-4 w-4" />{labels[key]}
            </Link>
          ))}
        </div>
      </nav>
      {/* mobile bottom navigation */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden" aria-label="Trip">
        <div className="grid grid-cols-5">
          {ITEMS.map(({ key, href, icon: Icon }) => (
            <Link key={key} href={base + href} aria-current={isActive(href) ? "page" : undefined}
              className={cn("flex flex-col items-center gap-0.5 pt-2 text-[11px] font-medium",
                isActive(href) ? "text-primary" : "text-muted-foreground")}>
              <Icon className="h-5 w-5" />{labels[key]}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
