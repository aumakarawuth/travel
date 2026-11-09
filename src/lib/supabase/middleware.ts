import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Single-user mode: there is no login screen. When no session exists, the
 * middleware signs in server-side as the built-in app account (credentials
 * live only in server env vars) and stores the session cookie. Database RLS
 * and RPCs keep working unchanged because requests still carry a real JWT.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    const email = process.env.APP_USER_EMAIL;
    const password = process.env.APP_USER_PASSWORD;
    if (!email || !password) {
      return new NextResponse("Server misconfigured: APP_USER_EMAIL / APP_USER_PASSWORD are not set.", { status: 500 });
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      console.error("[auto-login]", error.message);
      return new NextResponse("Auto sign-in failed. Check APP_USER_EMAIL / APP_USER_PASSWORD.", { status: 500 });
    }
  }
  return response;
}
