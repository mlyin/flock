"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { BUCKET, identifyAndDraft, type IdentifyOutcome } from "@/lib/intake";
import { draftListings } from "@/lib/listing";

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

/** Generate eBay and Depop copy for a confirmed garment. */
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
