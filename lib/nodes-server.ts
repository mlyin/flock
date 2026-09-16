import { supabaseAdmin } from "./supabase/server";

/**
 * Server-only plumbing for browser nodes: the provisioner on the node host,
 * and the two writes that more than one caller needs. Not a "use server"
 * file on purpose — nothing here may be reachable from a browser as an
 * action; app/node-actions.ts is the seller-facing surface and does the
 * session checks before calling in.
 */

export function provisionerConfigured(): boolean {
  return Boolean(process.env.NODE_PROVISION_URL && process.env.NODE_PROVISION_SECRET);
}

function provisioner(path: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const base = process.env.NODE_PROVISION_URL!.replace(/\/$/, "");
  const { timeoutMs = 30_000, ...rest } = init;
  return fetch(`${base}${path}`, {
    ...rest,
    headers: {
      ...(rest.headers ?? {}),
      authorization: `Bearer ${process.env.NODE_PROVISION_SECRET}`,
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
}

export type Provisioned = { url: string; host: string; port: number; password: string };

/** Ask the host for a container. Throws with a message a seller can read. */
export async function provisionNode(input: {
  slug: string;
  tz: string;
  proxy: string | null;
  token: string;
  apiBase: string;
}): Promise<Provisioned> {
  const response = await provisioner("/provision", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    timeoutMs: 120_000,
  });
  if (!response.ok) {
    throw new Error(`the node host answered ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  const body = (await response.json()) as Partial<Record<keyof Provisioned, unknown>>;
  const url = typeof body.url === "string" ? body.url : null;
  const host = typeof body.host === "string" ? body.host : null;
  const port = typeof body.port === "number" ? body.port : null;
  const password = typeof body.password === "string" ? body.password : null;
  if (!url || !url.startsWith("https://") || !host || port === null || !password) {
    throw new Error("the node host answered, but not with a browser (see ops/nodes/provisioner.py)");
  }
  return { url, host, port, password };
}

/**
 * Stop and remove a container. Best-effort by design: the caller decides
 * whether a failure here blocks what it was doing. Returns the error text,
 * or null on success.
 */
export async function retireNodeContainer(slug: string): Promise<string | null> {
  if (!provisionerConfigured()) return "browsers aren't configured on this deployment";
  try {
    const response = await provisioner(`/nodes/${encodeURIComponent(slug)}`, { method: "DELETE" });
    if (!response.ok) return `the node host answered ${response.status}`;
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export async function revokeTokenById(userId: string, tokenId: string): Promise<void> {
  await supabaseAdmin()
    .from("extension_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", tokenId)
    .eq("user_id", userId);
}

/**
 * Close every open job for a listing.
 *
 * `published` is the marketplace's word (posted route) or the seller's own
 * (markListed / markListedWithUrl, which carry a URL they pasted). Both are
 * the listing going live; neither is a node saying it pressed a button.
 * `failed` is included: a slow auto-submit that timed out on the node and
 * then landed is a published listing, not a failed fill.
 *
 * Runs under the service role because 0038 grants the session no UPDATE on
 * fill_jobs; scoped by user_id by hand, like every admin write.
 */
export async function closeOpenJobsForListing(
  userId: string,
  listingId: string,
  to: "published" | "cancelled"
): Promise<void> {
  await supabaseAdmin()
    .from("fill_jobs")
    .update({ status: to, finished_at: new Date().toISOString() })
    .eq("listing_id", listingId)
    .eq("user_id", userId)
    .in("status", ["queued", "running", "filled", "needs_seller", "failed"]);
}

/**
 * Shut a seller's node down for good: the container, the pairing token, and
 * the row's status. Used before account deletion, where the cascade would
 * otherwise delete the row and leave a container holding their marketplace
 * sessions running on the host.
 */
export async function retireNodeForUser(userId: string): Promise<{ ok: boolean; error?: string }> {
  const admin = supabaseAdmin();
  const { data: node } = await admin
    .from("nodes")
    .select("id, slug, status, token_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!node || node.status === "retired") return { ok: true };

  const failure = await retireNodeContainer(node.slug as string);
  if (failure) return { ok: false, error: failure };

  if (node.token_id) await revokeTokenById(userId, node.token_id as string);
  await admin
    .from("nodes")
    .update({ status: "retired" })
    .eq("id", node.id)
    .eq("user_id", userId);
  return { ok: true };
}
