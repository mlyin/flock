import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { supabaseAdmin, supabaseServer } from "./supabase/server";

/**
 * The credential behind the calendar feed URL.
 *
 * Deliberately separate from lib/exttoken.ts rather than a second `kind`
 * column on the same table. The two credentials have very different blast
 * radii — an extension token reaches the whole API; a leaked feed URL exposes
 * garment titles and dates — and sharing a table invites sharing a lookup,
 * which would quietly raise the calendar's reach to the API's.
 *
 * Unlike a bearer token this one travels in a URL, so it is longer and it is
 * URL-safe. It will sit in browser history, proxy logs and whatever sync
 * service the seller's calendar client uses, which is exactly why it has to be
 * both unguessable and revocable.
 */

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * 32 bytes, base64url.
 *
 * Not the extension's grouped-and-hyphenated format: nobody reads this one off
 * a screen, it gets copied into a subscription box once, so legibility buys
 * nothing and length is free.
 */
const generate = () => randomBytes(32).toString("base64url");

export async function issueFeedToken(label = "Calendar"): Promise<string> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Signed out.");

  const token = generate();
  const { error } = await supabase
    .from("calendar_feeds")
    .insert({ user_id: user.id, token_hash: hash(token), label });

  if (error) throw new Error(`Couldn't create the calendar feed: ${error.message}`);
  return token;
}

export async function revokeFeed(id: string): Promise<void> {
  const supabase = await supabaseServer();
  await supabase
    .from("calendar_feeds")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id);
}

/**
 * Resolve a feed token to its owner, or null.
 *
 * Runs through the service-role client because a calendar client carries no
 * session — there is no auth.uid() for RLS to match, so the scoping is by hand.
 */
export async function verifyFeedToken(token: string | null): Promise<string | null> {
  if (!token) return null;

  // Reject anything that is not the shape we issue before touching the
  // database, so a malformed URL costs no round trip.
  const clean = token.trim();
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(clean)) return null;

  const admin = supabaseAdmin();
  const { data } = await admin
    .from("calendar_feeds")
    .select("id, user_id, revoked_at")
    .eq("token_hash", hash(clean))
    .maybeSingle();

  if (!data || data.revoked_at) return null;

  // Fire-and-forget: a failed timestamp must not fail the feed.
  void admin
    .from("calendar_feeds")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);

  return data.user_id as string;
}

/**
 * Constant-time compare for anywhere a caller-supplied feed token is checked
 * against a known one.
 *
 * The lookup above is by hash and so is already constant-time-ish, but this
 * exists for any future path that compares two tokens directly — `===` on a
 * secret leaks its common prefix through timing.
 */
export function feedTokensEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) {
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}
