import { search } from "@/lib/geocode";
import { currentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Proxies address lookup rather than calling the provider from the browser.
 *
 * Three reasons: it keeps the provider swappable without touching the client,
 * it means an API key can be added later without ever reaching the browser, and
 * it stops this becoming an open geocoding proxy for anyone who finds the URL —
 * hence the sign-in check.
 */
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Signed out." }, { status: 401 });

  const query = new URL(request.url).searchParams.get("q") ?? "";

  try {
    return Response.json({ results: await search(query) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Lookup failed." },
      { status: 502 }
    );
  }
}
