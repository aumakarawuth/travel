"use client";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { deleteTripAction, setArchivedAction } from "@/app/actions/trips";
import type { Dict } from "@/i18n/th";

export function DangerZone({ tripId, tripName, archived, canDelete, t }:
  { tripId: string; tripName: string; archived: boolean; canDelete: boolean; t: Dict["settings"] & { cancel: string; errors: Dict["errors"] } }) {
  const [pending, start] = useTransition();
  const fail = (e: string) => toast.error((t.errors as Record<string, string>)[e] ?? t.errors.generic);
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={pending}
        onClick={() => start(async () => { const r = await setArchivedAction(tripId, !archived); if (!r.ok) fail(r.error); })}>
        {archived ? t.unarchive : t.archive}
      </Button>
      {canDelete && (
        <ConfirmDialog title={t.delete} body={t.deleteConfirm} confirmLabel={t.delete} cancelLabel={t.cancel} destructive requireText={tripName}
          trigger={<Button variant="destructive">{t.delete}</Button>}
          onConfirm={async () => { const r = await deleteTripAction(tripId); if (r && !r.ok) fail(r.error); }} />
      )}
    </div>
  );
}
