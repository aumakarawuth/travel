"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { joinTripAction } from "@/app/actions/trips";
import type { Dict } from "@/i18n/th";

export function JoinButton({ code, label, errors }: { code: string; label: string; errors: Dict["errors"] }) {
  const [state, action, pending] = useActionState(joinTripAction, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="code" value={code} />
      <Button size="lg" className="w-full" disabled={pending}>{label}</Button>
      {state && !state.ok && <p role="alert" className="text-sm text-destructive">{(errors as Record<string, string>)[state.error] ?? errors.generic}</p>}
    </form>
  );
}
