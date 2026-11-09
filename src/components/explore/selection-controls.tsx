"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateSelectionAction } from "@/app/actions/collab";
import { Select } from "@/components/ui/input";
import type { PlaceStatus, Priority } from "@/lib/explore";
import type { Dict } from "@/i18n/th";

export function SelectionControls({ placeId, status, priority, canEdit, t }:
  { placeId: string; status: PlaceStatus; priority: Priority; canEdit: boolean; t: { selection: Dict["selection"]; priority: Dict["priority"]; errors: Dict["errors"] } }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (patch: { status?: PlaceStatus; priority?: Priority }) => start(async () => {
    const r = await updateSelectionAction({ placeId, ...(patch as { status?: Exclude<PlaceStatus, "scheduled">; priority?: Priority }) });
    if (!r.ok) toast.error((t.errors as Record<string, string>)[r.error] ?? t.errors.generic);
    router.refresh();
  });
  return (
    <div className="grid grid-cols-2 gap-2" onClick={(e) => e.stopPropagation()}>
      <Select aria-label={t.selection.selected} className="h-9" value={status} disabled={!canEdit || pending || status === "scheduled"}
        title={canEdit ? undefined : t.selection.onlyEditors}
        onChange={(e) => run({ status: e.target.value as PlaceStatus })}>
        {(["proposed", "shortlisted", "selected", "rejected"] as const).map((s) => <option key={s} value={s}>{t.selection[s]}</option>)}
        {status === "scheduled" && <option value="scheduled">{t.selection.scheduled}</option>}
      </Select>
      <Select aria-label={t.selection.priority} className="h-9" value={priority} disabled={!canEdit || pending}
        onChange={(e) => run({ priority: e.target.value as Priority })}>
        {(["must_visit", "high", "normal", "optional"] as const).map((p) => <option key={p} value={p}>{t.priority[p]}</option>)}
      </Select>
    </div>
  );
}
