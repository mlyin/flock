import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authFetch, hasAuthCookie, withAuthDeadline } from "./lib/supabase/auth-deadline";

function atPath(path: string, root: string) {
  return path === root || path.startsWith(`${root}/`);
}

function loginRedirect(request: NextRequest) {
  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.search = "";
  login.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

function unavailable(request: NextRequest) {
  const headers = { "cache-control": "no-store", "retry-after": "30" };
  if (atPath(request.nextUrl.pathname, "/api")) {
    return NextResponse.json({ error: "Sign-in is temporarily unavailable. Please try again shortly." }, { status: 503, headers });
  }
  return new NextResponse(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Flock — temporarily unavailable</title><style>body{font:18px system-ui;background:#f7f8f1;color:#171a12;max-width:36rem;margin:15vh auto;padding:24px}a{color:inherit}p{line-height:1.6}</style><h1>Flock will be back shortly</h1><p>We can't reach the sign-in service right now. Your account hasn't been signed out. Please try again in a moment.</p><p><a href="">Try again</a> · <a href="/">Back to Flock</a></p></html>`,
    { status: 503, headers: { ...headers, "content-type": "text/html; charset=utf-8" } }
  );
}

/** Refresh verified sessions without letting an auth outage stall every route. */
export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  // These routes verify their own bearer token/signature. A browser session is
  // unrelated to their authorization and must not delay them.
  const independent = ["/api/ext", "/api/stripe", "/api/calendar", "/auth"].some((root) => atPath(path, root));
  const asset = path === "/sw.js" || path === "/manifest.webmanifest" || atPath(path, "/brand") || atPath(path, "/icons") || atPath(path, "/channels");
  if (independent || asset) return NextResponse.next({ request });

  const isPublic = path === "/" || ["/login", "/privacy", "/support", "/goodbye", "/offline", "/install", "/pricing"].some((root) => atPath(path, root));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  // Missing configuration never grants access to a protected route.
  if (!url || !key) return unavailable(request);

  if (!hasAuthCookie(request.cookies.getAll(), url)) {
    return isPublic ? NextResponse.next({ request }) : loginRedirect(request);
  }

  let response = NextResponse.next({ request });
  try {
    const { data, error } = await withAuthDeadline(async (signal) => {
      const supabase = createServerClient(url, key, {
        global: { fetch: authFetch(signal) },
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (list) => {
            // A late retry must not change cookies after the deadline response.
            if (signal.aborted) return;
            list.forEach(({ name, value }) => request.cookies.set(name, value));
            response = NextResponse.next({ request });
            list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          },
        },
      });
      // Verify with Auth; never authorize from the unverified session cookie.
      return supabase.auth.getUser();
    });

    if (error && (error.status === undefined || error.status >= 500 || error.name === "AuthRetryableFetchError")) {
      return isPublic ? response : unavailable(request);
    }

    let redirect: NextResponse | null = null;
    if (!data.user && !isPublic) redirect = loginRedirect(request);
    if (data.user && path === "/login") {
      const home = request.nextUrl.clone();
      home.pathname = "/";
      home.search = "";
      redirect = NextResponse.redirect(home);
    }
    if (redirect) {
      response.cookies.getAll().forEach((cookie) => redirect!.cookies.set(cookie));
      redirect.headers.set("cache-control", "no-store");
      return redirect;
    }
    response.headers.set("cache-control", "no-store");
    return response;
  } catch {
    // Public pages can render signed out. Server-side currentUser has the same
    // deadline, so the layout/page cannot reintroduce an unbounded auth wait.
    return isPublic ? NextResponse.next({ request }) : unavailable(request);
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
