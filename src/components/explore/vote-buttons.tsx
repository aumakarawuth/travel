"use client";
import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { voteAction } from "@/app/actions/collab";
import { tally, type ExplorePlace, type Person, type VoteValue } from "@/lib/explore";
import { cn } from "@/lib/utils";
import type { Dict } from "@/i18n/th";

const OPTIONS: { v: VoteValue; icon: string }[] = [{ v: "want", icon: "😍" }, { v: "maybe", icon: "🤔" }, { v: "not_interested", icon: "🙅" }];

export function VoteButtons({ placeId, votes, meId, people, t, compact }:
  { placeId: string; votes: ExplorePlace["votes"]; meId: string; people: Record<string, Person>; t: Dict["vote"]; compact?: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [optimistic, apply] = useOptimistic(votes, (cur, v: VoteValue) => {
    const mine = cur.find((x) => x.userId === meId);
    const rest = cur.filter((x) => x.userId !== meId);
    return mine?.vote === v ? rest : [...rest, { userId: meId, vote: v }];
  });
  const counts = tally(optimistic);
  const mine = optimistic.find((x) => x.userId === meId)?.vote;

  return (
    <div className="space-y-1">
      <div className="flex gap-1.5" role="group" aria-label={t.voters}>
        {OPTIONS.map(({ v, icon }) => (
          <button key={v} type="button" disabled={pending} aria-pressed={mine === v}
            onClick={(e) => { e.stopPropagation(); start(async () => { apply(v); const r = await voteAction(placeId, v); if (!r.ok) toast.error(r.error); router.refresh(); }); }}
            className={cn("flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition",
              mine === v ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}>
            <span aria-hidden>{icon}</span>{!compact && t[v]} <span className="tabular-nums">{counts[v]}</span>
          </button>
        ))}
      </div>
      {!compact && optimistic.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t.voters}: {optimistic.map((v) => `${people[v.userId]?.name ?? "?"} (${t[v.vote]})`).join(", ")}
        </p>
      )}
    </div>
  );
}
