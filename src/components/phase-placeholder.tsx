import { Construction } from "lucide-react";
import { EmptyState } from "@/components/ui/misc";
import { getDict } from "@/i18n";

/** Honest placeholder for routes whose functionality ships in a later phase. */
export async function PhasePlaceholder({ phase, title }: { phase: number; title: string }) {
  const { t } = await getDict();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{title}</h1>
      <EmptyState icon={<Construction />} title={t.phase.soon} body={t.phase.soonBody.replace("{n}", String(phase))} />
    </div>
  );
}
