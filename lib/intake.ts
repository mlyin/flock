import { supabaseServer } from "./supabase/server";
import { identifyGarment, type InferenceResult } from "./inference";

export const BUCKET = "photos";

/** Storage keys are `{user_id}/...` — the storage policies key off that first segment. */
export const inboxKey = (userId: string, filename: string) => `${userId}/inbox/${filename}`;

export type IdentifyOutcome =
  | { ok: true; itemId: string; sku: string; questions: string[] }
  | { ok: false; error: string };

/**
 * Files photos against a new item and assigns the next per-seller SKU.
 *
 * Shared by both intake paths — identified by the model, or typed in by hand.
 * Inference is a convenience here, not a dependency: the app is a working
 * inventory and cross-listing tool with no API key at all.
 */
async function fileAsItem(
  photoIds: string[],
  fields: Record<string, unknown>
): Promise<{ ok: true; itemId: string; sku: string } | { ok: false; error: string }> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're signed out. Reload and sign in again." };

  const { data: photos, error: photoError } = await supabase
    .from("photos")
    .select("id, storage_path")
    .in("id", photoIds)
    .is("item_id", null);

  if (photoError) return { ok: false, error: photoError.message };
  if (!photos?.length) return { ok: false, error: "Those photos are already filed against an item." };

  const { data: skuRow } = await supabase.rpc("next_sku", { p_user: user.id });
  const sku = (skuRow as string | null) ?? "CL-0001";

  const { data: item, error: itemError } = await supabase
    .from("items")
    .insert({
      user_id: user.id,
      sku,
      status: "draft",
      acquired_at: new Date().toISOString().slice(0, 10),
      source: "inbox",
      ...fields,
    })
    .select("id, sku")
    .single();

  if (itemError || !item) return { ok: false, error: itemError?.message ?? "Couldn't create the item." };

  // Re-file the objects under the item. A failed move leaves the photo on its
  // inbox key still pointing at real bytes, so the row is updated either way.
  for (const [index, photo] of photos.entries()) {
    const filename = photo.storage_path.split("/").pop()!;
    const destination = `${user.id}/${item.id}/${filename}`;
    const { error: moveError } = await supabase.storage
      .from(BUCKET)
      .move(photo.storage_path, destination);

    await supabase
      .from("photos")
      .update({
        item_id: item.id,
        storage_path: moveError ? photo.storage_path : destination,
        role: index === 0 ? "hero" : "detail",
        sort_order: index,
      })
      .eq("id", photo.id);
  }

  return { ok: true, itemId: item.id, sku: item.sku };
}

/** Photos in, blank garment out. No model call, no API key needed. */
export async function createItemByHand(photoIds: string[]) {
  return fileAsItem(photoIds, {
    title: "Untitled garment",
    category: "Other",
    condition: "good",
    flaws: [],
    review_state: "unreviewed",
  });
}

/**
 * Photo rows in → one unreviewed draft item out.
 *
 * Photos are already in storage by the time this runs (the browser uploads
 * straight to the bucket under RLS). This pulls them back down for the model,
 * writes the item, and re-files the objects under the new item id.
 */
export async function identifyAndDraft(photoIds: string[]): Promise<IdentifyOutcome> {
  const supabase = await supabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're signed out. Reload and sign in again." };

  const { data: photos, error: photoError } = await supabase
    .from("photos")
    .select("id, storage_path")
    .in("id", photoIds)
    .is("item_id", null);

  if (photoError) return { ok: false, error: photoError.message };
  if (!photos?.length) return { ok: false, error: "Those photos are already filed against an item." };

  // Download originals for the model. The bucket is private, so this is a
  // server-side fetch under the user's own session.
  const files = [];
  for (const photo of photos) {
    const { data, error } = await supabase.storage.from(BUCKET).download(photo.storage_path);
    if (error || !data) return { ok: false, error: `Couldn't read ${photo.storage_path}: ${error?.message}` };
    files.push({
      name: photo.storage_path.split("/").pop() ?? "photo.jpg",
      data: Buffer.from(await data.arrayBuffer()),
    });
  }

  let result: InferenceResult;
  try {
    result = await identifyGarment(files);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }

  const x = result.extraction;

  const { data: skuRow } = await supabase.rpc("next_sku", { p_user: user.id });
  const sku = (skuRow as string | null) ?? "CL-0001";

  const { data: item, error: itemError } = await supabase
    .from("items")
    .insert({
      user_id: user.id,
      sku,
      title: x.title || "Untitled",
      brand: x.brand || null,
      category: x.category || "Other",
      size: x.size || null,
      color: x.color || null,
      swatch: /^#[0-9a-fA-F]{6}$/.test(x.swatch) ? x.swatch : null,
      material: x.material || null,
      condition: x.condition || "good",
      flaws: x.flaws ?? [],
      status: "draft",
      review_state: "unreviewed",
      acquired_at: new Date().toISOString().slice(0, 10),
      notes: [x.era && `Era: ${x.era}`, x.notes].filter(Boolean).join("\n") || null,
    })
    .select("id, sku")
    .single();

  if (itemError || !item) return { ok: false, error: itemError?.message ?? "Couldn't create the item." };

  // Re-file the objects under the item. If a move fails the photo keeps its
  // inbox key and still points at real bytes — the row is updated either way.
  for (const [index, photo] of photos.entries()) {
    const filename = photo.storage_path.split("/").pop()!;
    const destination = `${user.id}/${item.id}/${filename}`;
    const { error: moveError } = await supabase.storage
      .from(BUCKET)
      .move(photo.storage_path, destination);

    await supabase
      .from("photos")
      .update({
        item_id: item.id,
        storage_path: moveError ? photo.storage_path : destination,
        role: index === 0 ? "hero" : "detail",
        sort_order: index,
      })
      .eq("id", photo.id);
  }

  await supabase.from("inferences").insert({
    user_id: user.id,
    item_id: item.id,
    model: result.model,
    fields: x,
    confidence: x.confidence ?? {},
    raw: result.raw,
    input_tokens: result.usage.input,
    output_tokens: result.usage.output,
  });

  return { ok: true, itemId: item.id, sku: item.sku, questions: x.questions ?? [] };
}

export async function latestInference(itemId: string) {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("inferences")
    .select("model, fields, confidence, created_at")
    .eq("item_id", itemId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}
