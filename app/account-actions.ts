"use server";

import { redirect } from "next/navigation";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { BUCKET } from "@/lib/intake";
import { stripe, stripeConfigured } from "@/lib/stripe";

/**
 * Deleting an account, for real.
 *
 * Apple's Guideline 5.1.1(v) requires any app supporting account CREATION to
 * offer account DELETION from inside the app. Flock's answer was a line on the
 * privacy page saying to email us, which Apple names specifically as not
 * sufficient — it has to be initiated in the product. So this exists because
 * of the App Store, but it should have existed anyway: "we'll delete it if you
 * ask nicely" is not a deletion feature.
 *
 * Three things have to happen and only one of them is automatic:
 *
 *   1. CANCEL THE SUBSCRIPTION FIRST. All nineteen tables cascade from
 *      auth.users, so deleting the user erases the stripe_customer_id along
 *      with everything else — and a live Stripe subscription with nothing left
 *      pointing at it goes on billing a person who believes they have left.
 *      That is the worst possible outcome of this flow, so it happens before
 *      anything is destroyed and a failure here stops the whole thing.
 *   2. DELETE THE PHOTOS. Storage objects have no foreign key and do not
 *      cascade. Miss this and the garments are gone while the photographs of
 *      them sit in a bucket indefinitely.
 *   3. DELETE THE AUTH USER, which cascades the nineteen tables.
 *
 * The order is deliberate: reversible-and-external first, irreversible last.
 */

export type DeleteOutcome = { ok: false; error: string };

export async function deleteAccount(confirmation: string): Promise<DeleteOutcome> {
  // Typed confirmation rather than a second button. This is the one action in
  // the product that cannot be undone by anyone, including us.
  if (confirmation.trim().toLowerCase() !== "delete my account") {
    return { ok: false, error: 'Type "delete my account" exactly to confirm.' };
  }

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're signed out." };

  const admin = supabaseAdmin();

  // --- 1. The subscription, before anything is destroyed ---------------------
  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.stripe_customer_id && stripeConfigured()) {
    try {
      const subscriptions = await stripe().subscriptions.list({
        customer: profile.stripe_customer_id,
        status: "active",
        limit: 100,
      });
      for (const subscription of subscriptions.data) {
        await stripe().subscriptions.cancel(subscription.id);
      }
    } catch (error) {
      // Refuse to continue. Deleting the account now would leave a live
      // subscription billing someone with no account to cancel it from, and
      // no record here of which customer it was.
      return {
        ok: false,
        error:
          "Couldn't cancel your subscription, so nothing was deleted. " +
          `Cancel it from Settings first, then try again. (${
            error instanceof Error ? error.message : String(error)
          })`,
      };
    }
  }

  // --- 2. The photos, which do not cascade -----------------------------------
  // Paginated: a seller with 200 garments has more objects than one list call
  // returns, and a partial delete leaves photographs behind silently.
  try {
    await removeAllUnder(admin, `${user.id}`);
  } catch (error) {
    return {
      ok: false,
      error:
        "Couldn't remove your photos, so nothing was deleted. Try again in a moment. " +
        `(${error instanceof Error ? error.message : String(error)})`,
    };
  }

  // --- 3. The user, which cascades everything else ---------------------------
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return { ok: false, error: error.message };

  await supabase.auth.signOut();
  redirect("/goodbye");
}

/**
 * Delete every object under a storage prefix, one page at a time.
 *
 * Supabase's list() is capped and does not recurse, so photos live under
 * {user_id}/inbox/ and {user_id}/{item_id}/ and both have to be walked.
 */
async function removeAllUnder(
  admin: ReturnType<typeof supabaseAdmin>,
  prefix: string
): Promise<void> {
  const { data: entries, error } = await admin.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (error) throw new Error(error.message);
  if (!entries || entries.length === 0) return;

  // An entry with no id is a folder — Supabase synthesises those from the key
  // prefixes, and calling remove() on one deletes nothing at all.
  const files = entries.filter((e) => e.id !== null).map((e) => `${prefix}/${e.name}`);
  const folders = entries.filter((e) => e.id === null);

  if (files.length > 0) {
    const { error: removeError } = await admin.storage.from(BUCKET).remove(files);
    if (removeError) throw new Error(removeError.message);
  }

  for (const folder of folders) {
    await removeAllUnder(admin, `${prefix}/${folder.name}`);
  }
}
