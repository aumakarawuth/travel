import { getDict } from "@/i18n";
import { LoginForm } from "./login-form";
import { ThemeToggle } from "@/components/theme";
import { safeNextPath } from "@/lib/safe-redirect";
import { Plane } from "lucide-react";

export const metadata = { title: "Login" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { t } = await getDict();
  const sp = await searchParams;
  return (
    <main className="relative flex min-h-dvh items-center justify-center bg-gradient-to-b from-accent to-background px-4">
      <div className="absolute right-3 top-3"><ThemeToggle /></div>
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <Plane className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{t.app.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t.app.tagline}</p>
        </div>
        <LoginForm t={t.auth} next={safeNextPath(sp.next)} authError={sp.error ? t.common.error : undefined} />
      </div>
    </main>
  );
}
