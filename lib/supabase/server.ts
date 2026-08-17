import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Request-scoped client for server components, route handlers, and server actions.
 * Carries the signed-in user's session, so every query runs under row-level
 * security — the database, not application code, decides what they can see.
 */
export async function supabaseServer() {
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

/** True once Supabase env vars exist. False means we're still in local SQLite mode. */
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
