import Link from "next/link";
import { Plane, UserRound, LogOut } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { ThemeToggle } from "@/components/theme";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/app/actions/trips";
import { getDict } from "@/i18n";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  const { t } = await getDict();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="container flex h-14 items-center justify-between">
          <Link href="/trips" className="flex items-center gap-2 font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Plane className="h-4 w-4" /></span>
            <span>{t.app.name}</span>
          </Link>
          <div className="flex items-center">
            <ThemeToggle />
            <Button variant="ghost" size="icon" asChild aria-label={t.nav.profile}><Link href="/profile"><UserRound /></Link></Button>
            <form action={signOutAction}>
              <Button variant="ghost" size="icon" aria-label={t.auth.signout}><LogOut /></Button>
            </form>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
