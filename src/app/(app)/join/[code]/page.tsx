import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { getDict } from "@/i18n";
import { normalizeInviteInput } from "@/lib/invite";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { formatDateRange } from "@/lib/utils";
import { JoinButton } from "./join-button";

export const metadata = { title: "Join trip" };

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const { supabase } = await requireUser(`/join/${encodeURIComponent(raw)}`);
  const { t, locale } = await getDict();
  const code = normalizeInviteInput(decodeURIComponent(raw));

  // trip-wide codes can be previewed; single-use tokens are joined directly on click
  const preview = code && code.length === 8
    ? (await supabase.rpc("preview_invite", { p_code: code })).data?.[0]
    : null;
  if (preview?.already_member) redirect(`/trips/${preview.trip_id}`);

  return (
    <main className="container max-w-md py-12">
      {!code || (code.length === 8 && !preview) ? (
        <EmptyState title={t.join.invalid} action={<Button asChild variant="outline"><Link href="/trips">{t.common.back}</Link></Button>} />
      ) : (
        <Card>
          <CardHeader>
            <CardDescription>{t.join.title}</CardDescription>
            <CardTitle className="text-2xl">{preview?.name ?? "—"}</CardTitle>
            {preview && (
              <CardDescription>
                {formatDateRange(preview.start_date, preview.end_date, locale)} · {preview.member_count} {t.trips.members}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <JoinButton code={code} label={t.join.cta} errors={t.errors} />
          </CardContent>
        </Card>
      )}
    </main>
  );
}
