import * as React from "react";
import { cn, initials } from "@/lib/utils";

export function Badge({ className, ...p }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", className)} {...p} />;
}

export function Skeleton({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-xl bg-muted", className)} {...p} />;
}

export function Avatar({ name, url, color, size = 36 }: { name: string; url?: string | null; color: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold text-white ring-2 ring-background"
      style={{ width: size, height: size, backgroundColor: color }}
      title={name}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        initials(name)
      )}
    </span>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: React.ReactNode; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed p-10 text-center">
      {icon && <div className="rounded-full bg-muted p-3 text-muted-foreground">{icon}</div>}
      <h3 className="font-semibold">{title}</h3>
      {body && <p className="max-w-sm text-sm text-muted-foreground">{body}</p>}
      {action}
    </div>
  );
}
