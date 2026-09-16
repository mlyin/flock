import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { currentBearer } from "../bearer-context";

/**
 * Request-scoped client for server components, route handlers, and server actions.
 * Carries the signed-in user's session, so every query runs under row-level
 * security — the database, not application code, decides what they can see.
 *
 * Two places a session can come from, one client to the rest of the code:
 * the browser's cookies, or — inside `withBearer()` on an /api/m route — the
 * access token a native app sent. Either way `auth.getUser()` is verified
 * with Supabase Auth on every call, and RLS sees the same user.
 */
export async function supabaseServer(): Promise<SupabaseClient> {
  const bearer = currentBearer();
  if (bearer) return bearerClient(bearer);

  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server components can't set cookies; middleware refreshes the session instead.
          }
        },
      },
    }
  );
}

/**
 * A client that acts as the bearer's user, for the native app.
 *
 * The token rides in the Authorization header of every request, so PostgREST
 * and Storage apply row-level security exactly as they do for a cookie
 * session. Every caller in this codebase asks `auth.getUser()` with no
 * argument and expects the request's own user; there is no cookie session
 * here to answer that from, so the call is pointed at the bearer, which
 * supabase-js then verifies with Supabase Auth — the same check the cookie
 * path makes, not a decode of the token's own claims.
 */
function bearerClient(jwt: string): SupabaseClient {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }
  );
  const original = client.auth.getUser.bind(client.auth);
  client.auth.getUser = ((token?: string) => original(token ?? jwt)) as typeof client.auth.getUser;
  return client;
}

/**
 * True once Supabase env vars exist.
 *
 * Only for telling a developer with no `.env.local` why the sign-in button is
 * missing. Never gate access on this: false means the app cannot work at all,
 * so anything that treats it as "skip the auth check" fails open.
 */
export function supabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}

/** The signed-in user, or null — including when Supabase isn't configured yet. */
export async function currentUser() {
  if (!supabaseConfigured()) return null;
  const { data } = await (await supabaseServer()).auth.getUser();
  return data.user;
}

/**
 * Service-role client — bypasses row-level security entirely.
 *
 * Use only where a request genuinely acts outside one user's session: OAuth
 * callbacks writing channel tokens, background jobs, admin tooling. Every call
 * site is responsible for its own scoping, because Postgres will not do it for
 * you here. Never import this into a client component.
 */
export function supabaseAdmin() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not set.");

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
