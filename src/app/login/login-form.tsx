"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import type { Dict } from "@/i18n/th";

export function LoginForm({ t, next, authError }: { t: Dict["auth"]; next: string; authError?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | undefined>(authError);

  const callback = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email")).trim();
    const password = String(fd.get("password"));
    setBusy(true);
    setMsg(undefined);
    const supabase = createClient();
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return setMsg(error.message);
        router.replace(next);
        router.refresh();
      } else {
        const display_name = String(fd.get("display_name") ?? "").trim().slice(0, 60);
        const { data, error } = await supabase.auth.signUp({
          email, password, options: { data: { display_name }, emailRedirectTo: callback() },
        });
        if (error) return setMsg(error.message);
        if (data.session) { router.replace(next); router.refresh(); }
        else toast.success(t.checkEmail);
      }
    } finally {
      setBusy(false);
    }
  }

  async function magic(form: HTMLFormElement | null) {
    const email = form ? String(new FormData(form).get("email") ?? "").trim() : "";
    if (!email) return setMsg(t.email);
    setBusy(true);
    const { error } = await createClient().auth.signInWithOtp({ email, options: { emailRedirectTo: callback() } });
    setBusy(false);
    if (error) setMsg(error.message); else toast.success(t.magicSent);
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <form onSubmit={onSubmit} className="space-y-4" id="auth-form">
          {mode === "register" && (
            <div className="space-y-2">
              <Label htmlFor="display_name">{t.displayName}</Label>
              <Input id="display_name" name="display_name" required maxLength={60} autoComplete="nickname" />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">{t.email}</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" inputMode="email" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t.password}</Label>
            <Input id="password" name="password" type="password" required minLength={8}
              autoComplete={mode === "login" ? "current-password" : "new-password"} />
          </div>
          {msg && <p role="alert" className="text-sm text-destructive">{msg}</p>}
          <Button className="w-full" size="lg" disabled={busy}>{mode === "login" ? t.login : t.register}</Button>
        </form>
        <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" />{t.or}<div className="h-px flex-1 bg-border" />
        </div>
        <Button variant="outline" className="w-full" disabled={busy}
          onClick={() => magic(document.getElementById("auth-form") as HTMLFormElement)}>
          {t.magicLink}
        </Button>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {mode === "login" ? t.noAccount : t.haveAccount}{" "}
          <button type="button" className="font-medium text-primary hover:underline" onClick={() => setMode(mode === "login" ? "register" : "login")}>
            {mode === "login" ? t.register : t.login}
          </button>
        </p>
      </CardContent>
    </Card>
  );
}
