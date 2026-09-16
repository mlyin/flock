import { parseBearer, withBearer } from "./bearer-context";
import { supabaseServer } from "./supabase/server";

/**
 * The /api/m routes: JSON for the native app, authenticated by the Supabase
 * access token the app got at sign-in.
 *
 * Every route starts in `withMobileSession`, which verifies the token with
 * Supabase Auth and then runs the route's work inside `withBearer`, so the
 * existing server actions and library functions — identification, drafting,
 * the fill queue, the plan cap — run unchanged, as that user, under RLS. No
 * route here reimplements a business rule; each one calls the function the
 * web app calls and returns what it returned. docs/MOBILE-API.md is the
 * contract.
 */

export type MobileUser = { id: string; email: string | null };

export const mjson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export async function withMobileSession(
  request: Request,
  fn: (user: MobileUser) => Promise<Response>
): Promise<Response> {
  const jwt = parseBearer(request.headers.get("authorization"));
  if (!jwt) {
    return mjson({ error: "Send the Supabase access token as a Bearer token." }, 401);
  }

  return withBearer(jwt, async () => {
    const { data, error } = await (await supabaseServer()).auth.getUser();
    if (error || !data.user) {
      return mjson({ error: "That session isn't valid. Sign in again." }, 401);
    }
    try {
      return await fn({ id: data.user.id, email: data.user.email ?? null });
    } catch (thrown) {
      // A server action that throws (rather than returning { ok: false })
      // is a bug, not a seller error; say what it said and stop.
      return mjson({ error: thrown instanceof Error ? thrown.message : String(thrown) }, 500);
    }
  });
}

/** The JSON body as an object, or null for anything else. */
export async function readJson<T extends object>(request: Request): Promise<T | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as T) : null;
  } catch {
    return null;
  }
}

/** A list of uuid-shaped strings, capped, or null if the input is not that. */
export function idList(value: unknown, max = 100): string[] | null {
  if (!Array.isArray(value)) return null;
  const ids = value.filter(
    (v): v is string =>
      typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  );
  if (ids.length !== value.length) return null;
  return ids.slice(0, max);
}
