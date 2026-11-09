"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { joinTripAction } from "@/app/actions/trips";
import type { Dict } from "@/i18n/th";

export function JoinForm({ t }: { t: Dict["trips"] & { errors: Dict["errors"] } }) {
  const [state, action, pending] = useActionState(joinTripAction, null);
  const err = state && !state.ok ? (t.errors as Record<string, string>)[state.error] ?? t.errors.generic : undefined;
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input name="code" placeholder={t.joinPlaceholder} aria-label={t.join} autoCapitalize="characters" required maxLength={300} />
        <Button variant="secondary" disabled={pending}>{t.join}</Button>
      </div>
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
    </form>
  );
}
