"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { BUCKET, createItemByHand, identifyAndDraft, type IdentifyOutcome } from "@/lib/intake";
import { LISTABLE, draftListings } from "@/lib/listing";
import { issueToken } from "@/lib/exttoken";
import { standing } from "@/lib/plan";

export async function analyzePhotos(photoIds: string[]): Promise<IdentifyOutcome> {
  if (photoIds.length === 0) return { ok: false, error: "Select at least one photo." };

  const outcome = await identifyAndDraft(photoIds);
  if (outcome.ok) {
    // Draft every channel immediately. Waiting for a button meant a freshly
    // identified garment landed on a page reading "no draft yet" eight times
    // over, with nothing to press but one more button — when the answer was
    // already sitting in the record we just wrote. This is the templated
    // version, which is free and instant; Rewrite with AI is still there for
    // copy worth paying for.
    await createBasicListings(outcome.itemId);
    revalidatePath("/add");
    revalidatePath("/");
  }
  return outcome;
}

/** Records a photo the browser has already uploaded to storage. */
export async function registerPhoto(storagePath: string, bytes: number) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Signed out." };

  // Trust nothing about the path: a client that lies here would be writing a row
  // pointing into someone else's storage prefix.
  if (!storagePath.startsWith(`${user.id}/`)) {
    return { ok: false as const, error: "That path isn't yours." };
  }

  const { data, error } = await supabase
    .from("photos")
    .insert({ user_id: user.id, storage_path: storagePath, bytes })
    .select("id")
    .single();

  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/add");
  // The id goes back so the caller can name exactly these photos in a
  // follow-up pass — background cleaning, for one — without re-querying.
  return { ok: true as const, photoId: data.id as string };
}

export async function deleteInboxPhoto(photoId: string) {
  const supabase = await supabaseServer();

  const { data: photo } = await supabase
    .from("photos")
    .select("storage_path")
    .eq("id", photoId)
    .is("item_id", null)
    .maybeSingle();

  if (!photo) return;

  await supabase.storage.from(BUCKET).remove([photo.storage_path]);
  await supabase.from("photos").delete().eq("id", photoId);
  revalidatePath("/add");
}

export type DraftOutcome = { ok: true } | { ok: false; error: string };

/** Generate eBay, Depop, Vinted, and Grailed copy for a confirmed garment. */
export async function prepareListings(itemId: string): Promise<DraftOutcome> {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "You're signed out." };

    const { data: item, error } = await supabase
      .from("items")
      .select("title, brand, category, size, color, material, condition, flaws, notes")
      .eq("id", itemId)
      .single();

    if (error || !item) return { ok: false, error: error?.message ?? "Item not found." };

    const { draft, model } = await draftListings({
      ...item,
      flaws: Array.isArray(item.flaws) ? (item.flaws as string[]) : [],
    });

    const now = new Date().toISOString();
    const rows = [
      {
        user_id: user.id,
        item_id: itemId,
        channel: "ebay" as const,
        title: draft.ebay.title,
        description: draft.ebay.description,
        price: draft.price.suggested,
        status: "draft" as const,
        draft: { category: draft.ebay.category, specifics: draft.ebay.specifics, price: draft.price },
        drafted_by: model,
        drafted_at: now,
      },
      {
        user_id: user.id,
        item_id: itemId,
        channel: "depop" as const,
        title: draft.depop.title,
        description: draft.depop.description,
        price: draft.price.suggested,
        status: "draft" as const,
        draft: { tags: draft.depop.tags, price: draft.price },
        drafted_by: model,
        drafted_at: now,
      },
      {
        // Mercari reuses the Vinted copy: both want a plain product name and a
        // straight description, so a fifth generation would buy nothing.
        user_id: user.id,
        item_id: itemId,
        channel: "mercari" as const,
        title: draft.vinted.title,
        description: draft.vinted.description,
        price: draft.price.suggested,
        status: "draft" as const,
        draft: { price: draft.price },
        drafted_by: model,
        drafted_at: now,
      },
      {
        user_id: user.id,
        item_id: itemId,
        channel: "vinted" as const,
        title: draft.vinted.title,
        description: draft.vinted.description,
        price: draft.price.suggested,
        status: "draft" as const,
        draft: { price: draft.price },
        drafted_by: model,
        drafted_at: now,
      },
      {
        user_id: user.id,
        item_id: itemId,
        channel: "grailed" as const,
        title: draft.grailed.title,
        description: draft.grailed.description,
        price: draft.price.suggested,
        status: "draft" as const,
        draft: { price: draft.price },
        drafted_by: model,
        drafted_at: now,
      },
    ];

    // Re-drafting replaces the previous copy rather than stacking duplicates.
    const { error: writeError } = await supabase
      .from("listings")
      .upsert(rows, { onConflict: "item_id,channel" });

    if (writeError) return { ok: false, error: writeError.message };

    revalidatePath(`/items/${itemId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Accept the draft, with whatever corrections the seller made. */
export async function confirmItem(formData: FormData) {
  const supabase = await supabaseServer();
  const id = String(formData.get("id"));

  const text = (key: string) => {
    const raw = formData.get(key);
    const value = typeof raw === "string" ? raw.trim() : "";
    return value === "" ? null : value;
  };

  const flaws = String(formData.get("flaws") ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const { error } = await supabase
    .from("items")
    .update({
      sku: text("sku"),
      title: text("title") ?? "Untitled",
      brand: text("brand"),
      category: text("category") ?? "Other",
      size: text("size"),
      color: text("color"),
      material: text("material"),
      style_code: text("style_code"),
      condition: text("condition") ?? "good",
      cost_basis: Number(formData.get("cost_basis") ?? 0) || 0,
      list_price: Number(formData.get("list_price") ?? 0) || null,
      floor_price: Number(formData.get("floor_price") ?? 0) || null,
      // Profit over cost, not a price. Zero and blank both mean "no target" —
      // a seller who genuinely wants to break even sets a price, not a goal.
      target_profit: Number(formData.get("target_profit") ?? 0) || null,
      package_size: text("package_size"),
      source: text("source"),
      flaws,
      notes: text("notes"),
      review_state: "confirmed",
    })
    .eq("id", id);

  if (error) throw new Error(`Saving failed: ${error.message}`);

  revalidatePath(`/items/${id}`);
  revalidatePath("/");
  redirect(`/items/${id}`);
}

export async function createPairingCode(): Promise<
  { ok: true; token: string } | { ok: false; error: string }
> {
  try {
    return { ok: true, token: await issueToken() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** The seller posted it by hand on their phone; record that it's live. */
/**
 * Whether this seller has room for one more live listing.
 *
 * Checked at every path that flips a listing to live, not in the UI. The UI
 * can be stale, and the extension records a publish through a bearer route
 * that never renders a page at all — a cap enforced only where a button is
 * drawn is a cap that the thing doing the work walks straight past.
 *
 * A listing that is ALREADY live doesn't need a slot; it has one. Without that
 * check, re-recording a URL for a live listing would fail at the cap and look
 * like the seller had lost a slot they never spent.
 */
async function roomForOneMore(listingId: string): Promise<string | null> {
  const supabase = await supabaseServer();

  const { data: current } = await supabase
    .from("listings")
    .select("status")
    .eq("id", listingId)
    .maybeSingle();

  if (current?.status === "live") return null;

  const where = await standing();
  if (!where || !where.atCap) return null;

  return `You have ${where.active} listings live, which is the limit on ${where.plan.label}. End one, or move up a tier — nothing is deleted either way.`;
}
export async function markListed(listingId: string) {
  const blocked = await roomForOneMore(listingId);
  if (blocked) return { ok: false as const, error: blocked };

  const supabase = await supabaseServer();

  const { data: listing } = await supabase
    .from("listings")
    .update({ status: "live", posted_at: new Date().toISOString(), posted_via: "manual" })
    .eq("id", listingId)
    .select("item_id")
    .maybeSingle();

  if (listing) {
    await supabase.from("items").update({ status: "listed" }).eq("id", listing.item_id);
    revalidatePath(`/items/${listing.item_id}`);
  }

  revalidatePath("/");
  return { ok: true as const };
}

/** Photos in, blank draft out — no model call, no API key required. */
export async function addItemByHand(photoIds: string[]): Promise<IdentifyOutcome> {
  if (photoIds.length === 0) return { ok: false, error: "Select at least one photo." };

  const outcome = await createItemByHand(photoIds);
  if (!outcome.ok) return outcome;

  await createBasicListings(outcome.itemId);
  revalidatePath("/add");
  revalidatePath("/");
  return { ok: true, itemId: outcome.itemId, sku: outcome.sku, questions: [] };
}

/**
 * Build listing rows straight from the garment's own fields.
 *
 * The description is assembled from what the seller already recorded rather
 * than written by a model, so this works with no API key. If a key is added
 * later, "Write listing copy" overwrites these with better prose.
 */
export async function createBasicListings(itemId: string): Promise<DraftOutcome> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're signed out." };

  const { data: item, error } = await supabase
    .from("items")
    .select("title, brand, size, color, material, condition, flaws, notes, list_price")
    .eq("id", itemId)
    .single();

  if (error || !item) return { ok: false, error: error?.message ?? "Item not found." };

  // Existing rows may already hold a literal "none" from before intake filtered
  // it, so strip it here too rather than only fixing it going forward.
  const flaws = (Array.isArray(item.flaws) ? (item.flaws as string[]) : []).filter(
    (f) => f && !/^(none|n\/?a|no flaws?|none noted)\.?$/i.test(f.trim())
  );
  // The brand leads the title, unless it's already in there. Identification
  // usually writes a title that starts with the brand ("Oakley Colorblock
  // T-Shirt"), and prepending unconditionally published "Oakley Oakley
  // Colorblock T-Shirt" — on every channel, from one line.
  const alreadyNamed =
    item.brand && item.title
      ? item.title.toLowerCase().includes(item.brand.toLowerCase())
      : false;

  const title = (alreadyNamed ? item.title : [item.brand, item.title].filter(Boolean).join(" "))
    .slice(0, 80)
    .trim();

  const description = [
    item.title,
    "",
    item.brand && `Brand: ${item.brand}`,
    item.size && `Size: ${item.size}`,
    item.color && `Colour: ${item.color}`,
    item.material && `Material: ${item.material}`,
    `Condition: ${item.condition}`,
    // Only ever state flaws we actually recorded. An empty list means nobody
    // wrote any down — which is NOT the same as having inspected the garment and
    // found none. The previous "No notable flaws." asserted the second from the
    // first, onto a live public listing the seller answers for: if there's a
    // stain the model didn't see, the listing was actively denying it. A listing
    // with no flaws section claims nothing; that's the honest default.
    flaws.length ? `\nFlaws:\n${flaws.map((f) => `- ${f}`).join("\n")}` : null,
    item.notes && `\n${item.notes}`,
  ]
    .filter(Boolean)
    .join("\n");

  const rows = LISTABLE.map((channel) => ({
    user_id: user.id,
    item_id: itemId,
    channel,
    title,
    description,
    price: Number(item.list_price ?? 0),
    status: "draft" as const,
    draft: null,
    drafted_by: "manual",
    drafted_at: new Date().toISOString(),
  }));

  const { error: writeError } = await supabase
    .from("listings")
    .upsert(rows, { onConflict: "item_id,channel" });

  if (writeError) return { ok: false, error: writeError.message };

  revalidatePath(`/items/${itemId}`);
  return { ok: true };
}


export type AddressRow = {
  id: string;
  label: string | null;
  name: string | null;
  line1: string;
  line2: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
  phone: string | null;
  is_default: boolean;
};

/** Create or update one ship-from address. */
export async function saveAddress(formData: FormData) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const text = (key: string) => {
    const raw = formData.get(key);
    const value = typeof raw === "string" ? raw.trim() : "";
    return value === "" ? null : value;
  };

  const id = text("id");
  const wantsDefault = formData.get("is_default") === "on";

  // One default per seller is a unique index, so clear the others first
  // rather than letting the insert collide.
  if (wantsDefault) {
    await supabase.from("addresses").update({ is_default: false }).eq("user_id", user.id);
  }

  const row = {
    user_id: user.id,
    label: text("label"),
    name: text("name"),
    line1: text("line1") ?? "",
    line2: text("line2"),
    city: text("city"),
    state: text("state"),
    postcode: text("postcode"),
    country: text("country"),
    phone: text("phone"),
    is_default: wantsDefault,
  };

  if (id) await supabase.from("addresses").update(row).eq("id", id);
  else await supabase.from("addresses").insert(row);

  revalidatePath("/settings");
}

export async function deleteAddress(id: string) {
  const supabase = await supabaseServer();
  await supabase.from("addresses").delete().eq("id", id);
  revalidatePath("/settings");
}

export async function makeDefaultAddress(id: string) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("addresses").update({ is_default: false }).eq("user_id", user.id);
  await supabase.from("addresses").update({ is_default: true }).eq("id", id);
  revalidatePath("/settings");
}

/**
 * Record that a listing went live, with the URL it went live at.
 *
 * The gap this closes: the extension fills a form and stops — the seller clicks
 * List themselves, on the marketplace. Nothing then told Flock it happened,
 * so items filled through the extension sat at "draft" forever while being live
 * on Depop. `markListed` existed but was only ever called from the step-by-step
 * post flow, so the faster route was the one that silently lost state.
 *
 * The URL is the useful half: without it there's no way back to the listing, and
 * no way to poll it later.
 */
export async function markListedWithUrl(
  listingId: string,
  url?: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const clean = (url ?? "").trim();

  if (clean && !/^https?:\/\//i.test(clean)) {
    return { ok: false, error: "That doesn't look like a link — it should start with https://" };
  }

  const blocked = await roomForOneMore(listingId);
  if (blocked) return { ok: false, error: blocked };

  const supabase = await supabaseServer();
  const { data: listing, error } = await supabase
    .from("listings")
    .update({
      status: "live",
      posted_at: new Date().toISOString(),
      posted_via: "extension",
      last_synced_at: new Date().toISOString(),
      ...(clean ? { url: clean } : {}),
    })
    .eq("id", listingId)
    .select("item_id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!listing) return { ok: false, error: "Couldn't find that listing." };

  await supabase.from("items").update({ status: "listed" }).eq("id", listing.item_id);

  revalidatePath(`/items/${listing.item_id}`);
  revalidatePath("/");
  return { ok: true };
}

/** Put a listing back to draft — it was ended, or marked live by mistake. */
export async function unmarkListed(
  listingId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await supabaseServer();
  const { data: listing, error } = await supabase
    .from("listings")
    .update({ status: "draft", posted_at: null })
    .eq("id", listingId)
    .select("item_id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!listing) return { ok: false, error: "Couldn't find that listing." };

  // Only drop the item back to draft if nothing else is still live.
  const { data: live } = await supabase
    .from("listings")
    .select("id")
    .eq("item_id", listing.item_id)
    .eq("status", "live");

  if (!live || live.length === 0) {
    await supabase.from("items").update({ status: "draft" }).eq("id", listing.item_id);
  }

  revalidatePath(`/items/${listing.item_id}`);
  revalidatePath("/");
  return { ok: true };
}

/** Save just the URL, without changing status. */
export async function saveListingUrl(
  listingId: string,
  url: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const clean = url.trim();
  if (!/^https?:\/\//i.test(clean)) {
    return { ok: false, error: "That doesn't look like a link — it should start with https://" };
  }

  const supabase = await supabaseServer();
  const { data: listing, error } = await supabase
    .from("listings")
    .update({ url: clean, last_synced_at: new Date().toISOString() })
    .eq("id", listingId)
    .select("item_id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (listing) revalidatePath(`/items/${listing.item_id}`);
  revalidatePath("/");
  return { ok: true };
}

/**
 * Remove a garment and everything attached to it.
 *
 * Wanted for the obvious reason — a bad identification run leaves items nobody
 * asked for, and an inventory you can't clean up stops being trusted. Five
 * drafts appeared from four photos once, and there was no way to undo it from
 * the app at all.
 *
 * Refuses once anything is live. A row here is not the listing: deleting the
 * record does NOT take the listing down, it just means Flock stops knowing
 * about something that's still for sale, which is how an item gets sold twice.
 * End the listings first, then delete.
 *
 * Storage objects go too. Orphaned photos in a private bucket are invisible and
 * still billed.
 */
export async function deleteItem(itemId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await supabaseServer();

  const { data: listings } = await supabase
    .from("listings")
    .select("channel, status")
    .eq("item_id", itemId);

  const live = (listings ?? []).filter((l) => l.status === "live");
  if (live.length > 0) {
    return {
      ok: false,
      error: `Still live on ${live
        .map((l) => l.channel)
        .join(", ")}. Deleting here wouldn't take those listings down — end them first, or mark them ended.`,
    };
  }

  const { data: photos } = await supabase
    .from("photos")
    .select("storage_path")
    .eq("item_id", itemId);

  const paths = (photos ?? []).map((p) => p.storage_path).filter(Boolean);
  if (paths.length > 0) await supabase.storage.from(BUCKET).remove(paths);

  // RLS scopes all of this to the owner; a wrong id deletes nothing rather than
  // someone else's garment.
  const { error } = await supabase.from("items").delete().eq("id", itemId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  revalidatePath("/add");
  return { ok: true };
}

/**
 * Start a Stripe Checkout session for a paid plan.
 *
 * `client_reference_id` and the subscription metadata both carry the Supabase
 * user id, because Stripe has never heard of Supabase and that id is the only
 * link back. Both, not one: the session carries it at checkout, the
 * subscription carries it for every renewal and cancellation afterwards.
 */
export async function startCheckout(
  plan: "hogget" | "mutton"
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const { stripe, stripeConfigured, PRICE } = await import("@/lib/stripe");

  if (!stripeConfigured()) return { ok: false, error: "Billing isn't set up on this server yet." };

  const price = PRICE[plan];
  if (!price) return { ok: false, error: `No price configured for ${plan}.` };

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're signed out." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id, beta")
    .eq("id", user.id)
    .maybeSingle();

  // A beta seller already has the top tier permanently. Sending them to a
  // checkout would take money for something they were given.
  if (profile?.beta) return { ok: false, error: "You're on Mutton permanently — nothing to pay." };

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.sellonflock.com";

  try {
    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      client_reference_id: user.id,
      customer: profile?.stripe_customer_id ?? undefined,
      customer_email: profile?.stripe_customer_id ? undefined : (user.email ?? undefined),
      subscription_data: { metadata: { user_id: user.id } },
      success_url: `${origin}/settings?upgraded=1`,
      cancel_url: `${origin}/pricing`,
      allow_promotion_codes: true,
    });

    if (!session.url) return { ok: false, error: "Stripe didn't return a checkout link." };
    return { ok: true, url: session.url };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Open Stripe's own billing portal — where cancelling actually happens. */
export async function openBillingPortal(): Promise<
  { ok: true; url: string } | { ok: false; error: string }
> {
  const { stripe, stripeConfigured } = await import("@/lib/stripe");
  if (!stripeConfigured()) return { ok: false, error: "Billing isn't set up on this server yet." };

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're signed out." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.stripe_customer_id) return { ok: false, error: "No subscription to manage." };

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.sellonflock.com";

  try {
    const session = await stripe().billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${origin}/settings`,
    });
    return { ok: true, url: session.url };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Replace inbox photos with white-background versions, processed off-device.
 *
 * Runs after upload rather than before it: the original is safely in storage
 * first, so a failure in the service can never cost the seller a photo. Each
 * photo that fails is simply left as it was, and the count of what actually
 * changed comes back.
 */
export async function cleanPhotoBackgrounds(
  photoIds: string[]
): Promise<{ ok: true; cleaned: number; failed: number } | { ok: false; error: string }> {
  const { studioBackgroundServer, studioConfigured } = await import("@/lib/studio-server");

  if (!studioConfigured()) {
    return {
      ok: false,
      error:
        "No background service is configured on this server. Set BG_REMOVAL_URL to your rembg instance — see docs/BACKGROUND-REMOVAL.md.",
    };
  }
  if (photoIds.length === 0) return { ok: true, cleaned: 0, failed: 0 };

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're signed out." };

  const { data: photos } = await supabase
    .from("photos")
    .select("id, storage_path")
    .in("id", photoIds);

  if (!photos?.length) return { ok: false, error: "Those photos are gone." };

  let cleaned = 0;
  let failed = 0;

  for (const photo of photos) {
    try {
      const { data, error } = await supabase.storage.from(BUCKET).download(photo.storage_path);
      if (error || !data) throw new Error(error?.message ?? "download failed");

      const name = photo.storage_path.split("/").pop() ?? "photo.jpg";
      const output = await studioBackgroundServer(Buffer.from(await data.arrayBuffer()), name);

      // Overwrite in place. The signed URLs the app hands out are generated per
      // request from the path, so nothing holds a stale link to the original.
      const { error: writeError } = await supabase.storage
        .from(BUCKET)
        .upload(photo.storage_path, output, { contentType: "image/jpeg", upsert: true });

      if (writeError) throw new Error(writeError.message);

      await supabase.from("photos").update({ bytes: output.byteLength }).eq("id", photo.id);
      cleaned += 1;
    } catch {
      // The original is untouched and still listable. One bad photo shouldn't
      // stop the rest of the batch.
      failed += 1;
    }
  }

  revalidatePath("/add");
  return { ok: true, cleaned, failed };
}

/**
 * Set the profit target, and optionally take one of the asks it produced.
 *
 * Both in one action because they're one gesture: the seller types what they
 * want to make, reads the row for the channel they favour, and takes that
 * price. Two round trips would let the target save and the price fail.
 */
export async function setTargetAndPrice(
  itemId: string,
  targetProfit: number | null,
  listPrice?: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await supabaseServer();

  const patch: Record<string, number | null> = {
    target_profit: targetProfit && targetProfit > 0 ? targetProfit : null,
  };
  if (typeof listPrice === "number" && listPrice > 0) patch.list_price = listPrice;

  const { error } = await supabase.from("items").update(patch).eq("id", itemId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/items/${itemId}`);
  revalidatePath("/");
  return { ok: true };
}

/**
 * Copy-edit the notes and flaws the seller typed, without adding to them.
 *
 * Takes the CURRENT textarea contents rather than reading the row, so it edits
 * what's on screen — a seller who has just typed three lines and not saved
 * would otherwise watch their words get replaced by yesterday's.
 */
export async function tidyItemNotes(
  itemId: string,
  notes: string,
  flaws: string[]
): Promise<{ ok: true; notes: string; flaws: string[] } | { ok: false; error: string }> {
  try {
    const { tidyNotes } = await import("@/lib/notes");
    const supabase = await supabaseServer();

    const { data: item } = await supabase
      .from("items")
      .select("title, brand, category, size")
      .eq("id", itemId)
      .single();

    const { result } = await tidyNotes({ notes, flaws, ...(item ?? {}) });
    return { ok: true, notes: result.notes, flaws: result.flaws };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
