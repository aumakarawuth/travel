"use client";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/input";
import type { ActionResult } from "@/app/actions/result";
import { TRAVEL_MODES } from "@/lib/validation/trip";
import type { Dict } from "@/i18n/th";
import type { Trip } from "@/lib/types";

type Labels = { form: Dict["form"]; travelMode: Dict["travelMode"]; errors: Dict["errors"]; saved: string };

export function TripForm({
  action, labels, initial, submitLabel, readOnly,
}: {
  action: (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;
  labels: Labels; initial?: Partial<Trip>; submitLabel: string; readOnly?: boolean;
}) {
  const [state, formAction, pending] = useActionState(async (prev: ActionResult | null, fd: FormData) => {
    const r = await action(prev, fd);
    if (r.ok) toast.success(labels.saved);
    else if (r.error !== "validation") toast.error((labels.errors as Record<string, string>)[r.error] ?? labels.errors.generic);
    return r;
  }, null);
  const [more, setMore] = useState(Boolean(initial));
  const today = new Date().toISOString().slice(0, 10);
  const fe = state && !state.ok ? state.fieldErrors ?? {} : {};
  const err = (k: string) => (fe[k] ? (labels.errors as Record<string, string>)[fe[k]] ?? fe[k] : undefined);
  const f = labels.form;

  return (
    <form action={formAction} className="space-y-5">
      <fieldset disabled={readOnly || pending} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="name">{f.name}</Label>
          <Input id="name" name="name" required maxLength={120} defaultValue={initial?.name} placeholder="เชียงใหม่ 3 วัน 2 คืน" />
          <FieldError msg={err("name")} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="start_date">{f.startDate}</Label>
            <Input id="start_date" name="start_date" type="date" required defaultValue={initial?.start_date ?? today} />
            <FieldError msg={err("start_date")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="end_date">{f.endDate}</Label>
            <Input id="end_date" name="end_date" type="date" required defaultValue={initial?.end_date ?? today} />
            <FieldError msg={err("end_date")} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="start_location_name">{f.start}</Label>
            <Input id="start_location_name" name="start_location_name" maxLength={200} defaultValue={initial?.start_location_name ?? ""} placeholder="กรุงเทพฯ" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="end_location_name">{f.end}</Label>
            <Input id="end_location_name" name="end_location_name" maxLength={200} defaultValue={initial?.end_location_name ?? ""} />
          </div>
        </div>

        <button type="button" onClick={() => setMore(!more)} className="flex items-center gap-1 text-sm font-medium text-primary">
          <ChevronDown className={`h-4 w-4 transition ${more ? "rotate-180" : ""}`} />{f.more}
        </button>

        <div className={more ? "space-y-5" : "hidden"}>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="budget_total">{f.budget}</Label>
              <Input id="budget_total" name="budget_total" type="number" min={0} step="1" inputMode="numeric" defaultValue={initial?.budget_total ?? ""} />
              <FieldError msg={err("budget_total")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">{f.currency}</Label>
              <Input id="currency" name="currency" maxLength={3} defaultValue={initial?.currency ?? "THB"} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="expected_member_count">{f.memberCount}</Label>
              <Input id="expected_member_count" name="expected_member_count" type="number" min={1} max={100} defaultValue={initial?.expected_member_count ?? 2} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="travel_mode">{f.travelMode}</Label>
              <Select id="travel_mode" name="travel_mode" defaultValue={initial?.travel_mode ?? "car"}>
                {TRAVEL_MODES.map((m) => <option key={m} value={m}>{labels.travelMode[m]}</option>)}
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="daily_start_time">{f.dailyStart}</Label>
              <Input id="daily_start_time" name="daily_start_time" type="time" defaultValue={initial?.daily_start_time?.slice(0, 5) ?? "09:00"} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="daily_end_time">{f.dailyEnd}</Label>
              <Input id="daily_end_time" name="daily_end_time" type="time" defaultValue={initial?.daily_end_time?.slice(0, 5) ?? "20:00"} />
              <FieldError msg={err("daily_end_time")} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">{f.description} <span className="text-muted-foreground">({f.optional})</span></Label>
            <Textarea id="description" name="description" maxLength={2000} defaultValue={initial?.description ?? ""} />
          </div>
        </div>
        {!readOnly && <Button size="lg" className="w-full" disabled={pending}>{submitLabel}</Button>}
      </fieldset>
    </form>
  );
}
