import { requireUser } from "@/lib/supabase/server";
import { getDict } from "@/i18n";
import type { Profile } from "@/lib/types";
import { ProfileForm } from "./profile-form";
import { ClearOfflineCache } from "@/components/pwa/pwa";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const { supabase, user } = await requireUser("/profile");
  const { t } = await getDict();
  const { data } = await supabase.from("profiles").select("id,display_name,avatar_url,color,locale").eq("id", user.id).single<Profile>();
  return (
    <main className="container max-w-md py-6">
      <h1 className="mb-6 text-2xl font-bold">{t.profile.title}</h1>
      {data && <ProfileForm profile={data} email={user.email ?? ""}
        t={{ ...t.profile, displayName: t.auth.displayName, save: t.form.save, saved: t.common.saved, errors: t.errors }} />}
      <div className="mt-8 space-y-2 border-t pt-6">
        <h2 className="font-semibold">{t.pwa.offlineTitle}</h2>
        <p className="text-sm text-muted-foreground">{t.pwa.offlineBody}</p>
        <ClearOfflineCache label={t.pwa.clear} done={t.pwa.cleared} />
      </div>
    </main>
  );
}
