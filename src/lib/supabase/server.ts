import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

export async function createClient() {
  const env = publicEnv();
  const cookieStore = await cookies();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // called from a Server Component: middleware refreshes the session instead
        }
      },
    },
  });
}

/** Returns the verified user (getUser hits Supabase Auth; never trust getSession on the server). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function requireUser(_nextPath?: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  // middleware auto-signs-in the app account, so this only fails on misconfiguration
  if (error || !data.user) throw new Error("Not signed in (check APP_USER_EMAIL / APP_USER_PASSWORD)");
  return { supabase, user: data.user };
}
