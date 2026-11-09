"use client";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Avatar } from "@/components/ui/misc";
import { updateProfileAction } from "@/app/actions/profile";
import type { Profile } from "@/lib/types";
import type { Dict } from "@/i18n/th";

const PALETTE = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#3b82f6", "#6366f1", "#a855f7", "#ec4899", "#64748b"];

export function ProfileForm({ profile, email, t }:
  { profile: Profile; email: string; t: Dict["profile"] & { displayName: string; save: string; saved: string; errors: Dict["errors"] } }) {
  const [color, setColor] = useState(profile.color);
  const [name, setName] = useState(profile.display_name);
  const [, action, pending] = useActionState(async (p: unknown, fd: FormData) => {
    const r = await updateProfileAction(null, fd);
    if (r.ok) toast.success(t.saved); else toast.error(t.errors.generic);
    return r;
  }, null);
  return (
    <form action={action} className="space-y-5">
      <div className="flex items-center gap-3">
        <Avatar name={name} url={profile.avatar_url} color={color} size={56} />
        <span className="text-sm text-muted-foreground">{email}</span>
      </div>
      <div className="space-y-2">
        <Label htmlFor="display_name">{t.displayName}</Label>
        <Input id="display_name" name="display_name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t.color}</legend>
        <input type="hidden" name="color" value={color} />
        <div className="flex flex-wrap gap-2">
          {PALETTE.map((c) => (
            <button key={c} type="button" aria-label={c} aria-pressed={c === color} onClick={() => setColor(c)}
              className={`h-9 w-9 rounded-full ring-offset-2 ring-offset-background ${c === color ? "ring-2 ring-foreground" : ""}`}
              style={{ backgroundColor: c }} />
          ))}
        </div>
      </fieldset>
      <div className="space-y-2">
        <Label htmlFor="locale">{t.language}</Label>
        <Select id="locale" name="locale" defaultValue={profile.locale}>
          <option value="th">ไทย</option>
          <option value="en">English</option>
        </Select>
      </div>
      <Button className="w-full" size="lg" disabled={pending}>{t.save}</Button>
    </form>
  );
}
