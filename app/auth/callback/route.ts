import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Where Google sends the user back. Trades the one-time code for a session
 * cookie, then forwards them on.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  // Only ever redirect to a path on this origin — an open redirect here would
  // let a crafted link bounce a freshly signed-in user to someone else's site.
  const requested = url.searchParams.get("next") ?? "/";
  const next = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/";

  const fail = (message: string) => {
    const login = new URL("/login", url.origin);
    login.searchParams.set("error", message);
    return NextResponse.redirect(login);
  };

  // Google reports user-cancelled consent this way.
  const oauthError = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (oauthError) return fail(oauthError);
  if (!code) return fail("Google didn't send an authorization code.");

  const { error } = await (await supabaseServer()).auth.exchangeCodeForSession(code);
  if (error) return fail(error.message);

  return NextResponse.redirect(new URL(next, url.origin));
}
