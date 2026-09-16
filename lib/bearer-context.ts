import { AsyncLocalStorage } from "node:async_hooks";

/**
 * A request's bearer token, carried down the call stack without changing a
 * signature.
 *
 * The web app's data layer asks `supabaseServer()` for a client and that
 * client reads the session out of cookies. A native app has no cookies; it
 * has the Supabase access token it got at sign-in. Rather than thread a
 * client parameter through every server action and library function (there
 * are dozens, and every one would then have two ways to be wrong), the
 * /api/m routes run their work inside `withBearer`, and `supabaseServer()`
 * checks here first. Same functions, same plan gates, same RLS — the only
 * difference is where the credential came from.
 *
 * AsyncLocalStorage is request-scoped in Node the way a cookie jar is: two
 * concurrent requests each see their own store, and a request with no store
 * sees none. No next/* import here so this stays unit-testable.
 */
const store = new AsyncLocalStorage<string>();

export function withBearer<T>(jwt: string, fn: () => Promise<T>): Promise<T> {
  return store.run(jwt, fn);
}

export function currentBearer(): string | null {
  return store.getStore() ?? null;
}

/**
 * The token out of an Authorization header, or null.
 *
 * A Supabase access token is a JWT: three base64url segments. Anything else
 * — an extension pairing code, an API key pasted by mistake — is refused
 * here rather than forwarded to Supabase as a credential.
 */
export function parseBearer(header: string | null | undefined): string | null {
  const raw = header?.replace(/^Bearer\s+/i, "").trim();
  if (!raw) return null;
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(raw) ? raw : null;
}
