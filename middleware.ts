import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the auth session on every request and gates the app behind sign-in.
 *
 * Server components can't write cookies, so token refresh has to happen here or
 * sessions expire mid-use.
 */
export async function middleware(request: NextRequest) {
  // Fail closed. This used to wave the request through so the old local SQLite
  // mode kept working, but SQLite is gone and auth is now the only way in — so
  // a missing or misspelt env var silently removed the gate from every page
  // instead of breaking anything loudly enough to notice. A deploy that loses
  // its Supabase config should serve nothing, not serve everything.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return new NextResponse(
      "Flock is misconfigured: Supabase environment variables are missing. See .env.example.",
      { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } }
    );
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  // getUser() revalidates against Supabase — getSession() would trust a cookie
  // the browser could have tampered with.
  const { data } = await supabase.auth.getUser();

  const isPublic =
    // The root is the landing page when signed out and the inventory when
    // signed in — app/page.tsx decides. Redirecting it away from strangers
    // meant sellonflock.com showed a bare Google button and no explanation
    // of what the product was.
    request.nextUrl.pathname === "/" ||
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/auth") ||
    request.nextUrl.pathname.startsWith("/privacy") ||
    // Where account deletion lands. By then there is no account, so gating it
    // would bounce them to /login — which reads as the delete having failed.
    request.nextUrl.pathname.startsWith("/goodbye") ||
    // Shown by the service worker when a navigation fails. Someone with no
    // connection cannot be authenticated either, so gating it would replace
    // the offline page with a redirect that also cannot load.
    request.nextUrl.pathname.startsWith("/offline") ||
    // The extension install instructions are the link you send a friend who
    // doesn't have an account yet.
    request.nextUrl.pathname.startsWith("/install") ||
    // Read before signing up, so it cannot require being signed in.
    request.nextUrl.pathname.startsWith("/pricing") ||
    // The extension authenticates with a bearer token and carries no session
    // cookie. Redirecting it to /login hands it an HTML page where it expects
    // JSON; these routes verify the token themselves.
    request.nextUrl.pathname.startsWith("/api/ext") ||
    // Stripe carries no session cookie and never follows redirects. Gating
    // this bounced every webhook to /login with a 307, so a paid subscription
    // would never have reached profiles.plan. The route verifies Stripe's own
    // signature, which is a stronger check than a session would be.
    request.nextUrl.pathname.startsWith("/api/stripe") ||
    // The calendar feed. Calendar.app, Google Calendar and iOS have no login
    // step when subscribing, so they carry no session and never will — the
    // token in the path is the credential, and the route verifies it itself.
    // Gating this would hand a calendar client an HTML redirect where it
    // expects an .ics, which every client reports as "the URL is not a
    // calendar" rather than as an auth problem.
    request.nextUrl.pathname.startsWith("/api/calendar");

  if (!data.user && !isPublic) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }

  if (data.user && request.nextUrl.pathname === "/login") {
    const home = request.nextUrl.clone();
    home.pathname = "/";
    home.search = "";
    return NextResponse.redirect(home);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
