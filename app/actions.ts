"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { BUCKET, createItemByHand, identifyAndDraft, type IdentifyOutcome } from "@/lib/intake";
import { draftListings } from "@/lib/listing";
import { issueToken } from "@/lib/exttoken";

export async function analyzePhotos(photoIds: string[]): Promise<IdentifyOutcome> {
  if (photoIds.length === 0) return { ok: false, error: "Select at least one photo." };

  const outcome = await identifyAndDraft(photoIds);
  if (outcome.ok) {
    revalidatePath("/inbox");
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

  const { error } = await supabase
    .from("photos")
    .insert({ user_id: user.id, storage_path: storagePath, bytes });

  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/inbox");
  return { ok: true as const };
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
  revalidatePath("/inbox");
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
      title: text("title") ?? "Untitled",
      brand: text("brand"),
      category: text("category") ?? "Other",
      size: text("size"),
      color: text("color"),
      material: text("material"),
      condition: text("condition") ?? "good",
      cost_basis: Number(formData.get("cost_basis") ?? 0) || 0,
      list_price: Number(formData.get("list_price") ?? 0) || null,
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
export async function markListed(listingId: string) {
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
}

/** Photos in, blank draft out — no model call, no API key required. */
export async function addItemByHand(photoIds: string[]): Promise<IdentifyOutcome> {
  if (photoIds.length === 0) return { ok: false, error: "Select at least one photo." };

  const outcome = await createItemByHand(photoIds);
  if (!outcome.ok) return outcome;

  revalidatePath("/inbox");
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
  const title = [item.brand, item.title].filter(Boolean).join(" ").slice(0, 80);

  const description = [
    item.title,
    "",
    item.brand && `Brand: ${item.brand}`,
    item.size && `Size: ${item.size}`,
    item.color && `Colour: ${item.color}`,
    item.material && `Material: ${item.material}`,
    `Condition: ${item.condition}`,
    flaws.length ? `\nFlaws:\n${flaws.map((f) => `- ${f}`).join("\n")}` : "\nNo notable flaws.",
    item.notes && `\n${item.notes}`,
  ]
    .filter(Boolean)
    .join("\n");

  const rows = (["depop", "mercari", "ebay"] as const).map((channel) => ({
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
