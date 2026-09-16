import { createHash, randomBytes } from "node:crypto";
import { supabaseAdmin, supabaseServer } from "./supabase/server";

/**
 * Bearer tokens for the browser extension.
 *
 * The plaintext token is shown to the user exactly once, at pairing time, and
 * only its hash is stored. Verification runs through the secret-key client
 * because a bearer caller has no Supabase session — there's no auth.uid() for
 * RLS to match, so the scoping is done explicitly here instead.
 */

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** Grouped for legibility when the user reads it off the screen. */
function generate() {
  const raw = randomBytes(18).toString("base64url").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (raw + randomBytes(9).toString("hex").toUpperCase())
    .slice(0, 24)
    .match(/.{1,6}/g)!
    .join("-");
}

/**
 * Mint a token and return its row id alongside the plaintext.
 *
 * The id is what ties a browser node to the token it was paired with
 * (nodes.token_id), so the jobs route can tell a node from a laptop by the
 * bearer alone. Nothing else needs the id; `issueToken` below hides it.
 */
export async function issueTokenWithId(
  label = "Chrome extension"
): Promise<{ token: string; id: string }> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Signed out.");

  const token = generate();
  const { data, error } = await supabase
    .from("extension_tokens")
    .insert({ user_id: user.id, token_hash: hash(token), label })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Couldn't create a pairing code: ${error?.message ?? "no row came back"}`);
  }
  return { token, id: data.id as string };
}

export async function issueToken(label = "Chrome extension") {
  return (await issueTokenWithId(label)).token;
}

export async function revokeToken(id: string) {
  const supabase = await supabaseServer();
  await supabase.from("extension_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", id);
}

/**
 * Returns the owning user id and the token's row id, or null. Normalises
 * formatting the user may mangle. The row id is how /api/ext/jobs finds the
 * node a token belongs to; every other bearer route only wants the user.
 */
export async function verifyTokenDetailed(
  header: string | null
): Promise<{ userId: string; tokenId: string } | null> {
  const raw = header?.replace(/^Bearer\s+/i, "").trim();
  if (!raw) return null;

  const normalised = raw.toUpperCase().replace(/[^A-Z0-9-]/g, "");
  const admin = supabaseAdmin();

  const { data } = await admin
    .from("extension_tokens")
    .select("id, user_id, revoked_at")
    .eq("token_hash", hash(normalised))
    .maybeSingle();

  if (!data || data.revoked_at) return null;

  // Fire-and-forget: a failed timestamp update shouldn't fail the request.
  // For a node this stamp is also its heartbeat — lib/nodes.ts reads it.
  void admin
    .from("extension_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);

  return { userId: data.user_id as string, tokenId: data.id as string };
}

/** Returns the owning user id, or null. */
export async function verifyToken(header: string | null): Promise<string | null> {
  return (await verifyTokenDetailed(header))?.userId ?? null;
}

/** The extension has its own origin, so these routes are CORS-open; the bearer token is the gate. */
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export const unauthorized = () =>
  new Response(JSON.stringify({ error: "Pair the extension in Flock first." }), {
    status: 401,
    headers: { ...CORS, "content-type": "application/json" },
  });

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
