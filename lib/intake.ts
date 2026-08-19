import { supabaseServer } from "./supabase/server";
import { identifyGarment, type InferenceResult } from "./inference";

export const BUCKET = "photos";

/** Storage keys are `{user_id}/...` — the storage policies key off that first segment. */
export const inboxKey = (userId: string, filename: string) => `${userId}/inbox/${filename}`;

export type IdentifyOutcome =
  | { ok: true; itemId: string; sku: string; questions: string[] }
  | { ok: false; error: string };

/**
 * Take ownership of the photos, and say how many were actually taken.
 *
 * The `is("item_id", null)` filter is the whole point. Two identify calls can
 * both read the inbox, both see the same free photos, and both create an item —
 * then whichever writes second would quietly steal the photos from the first,
 * leaving a garment with none. That happened: CL-0003 was an Oakley tee with
 * zero photos, created beside the item that took them.
 *
 * With the filter, the second writer claims nothing and its caller can clean up
 * instead of leaving an empty garment in the inventory.
 */
async function claimPhotos(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  userId: string,
  itemId: string,
  photos: { id: string; storage_path: string }[]
): Promise<number> {
  let claimed = 0;

  for (const [index, photo] of photos.entries()) {
    const filename = photo.storage_path.split("/").pop()!;
    const destination = `${userId}/${itemId}/${filename}`;

    // Claim the ROW first. Moving the object before knowing the row is ours
    // would relocate a file the other writer's item is pointing at.
    const { data: taken } = await supabase
      .from("photos")
      .update({ item_id: itemId, role: index === 0 ? "hero" : "detail", sort_order: index })
      .eq("id", photo.id)
      .is("item_id", null)
      .select("id")
      .maybeSingle();

    if (!taken) continue; // someone else got there first
    claimed += 1;

    // A failed move leaves the photo on its inbox key still pointing at real
    // bytes, so only update the path when the move actually worked.
    const { error: moveError } = await supabase.storage
      .from(BUCKET)
      .move(photo.storage_path, destination);

    if (!moveError) {
      await supabase.from("photos").update({ storage_path: destination }).eq("id", photo.id);
    }
  }

  return claimed;
}
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

  const claimed = await claimPhotos(supabase, user.id, item.id, photos);
  if (claimed === 0) {
    // Another call took them between our read and our write. Don't leave a
    // garment with no photos behind — it can't be listed anywhere and only
    // gets deleted by hand later.
    await supabase.from("items").delete().eq("id", item.id);
    return { ok: false, error: "Those photos were just filed against another garment." };
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
    const message = error instanceof Error ? error.message : String(error);

    // The SDK's 401 arrives as a wall of JSON — `401 {"type":"error","error":
    // {"type":"authentication_error",...}}` — which tells a seller nothing and
    // reads like the app is broken. It almost always means one thing: the
    // server this is running on has no key. Say that, and where to put one.
    if (/authentication_error|401|invalid x-api-key|API key is invalid/i.test(message)) {
      return {
        ok: false,
        error:
          "This server has no valid Anthropic API key. Locally, set ANTHROPIC_API_KEY in .env.local and restart the dev server — Next only reads it at boot. On sellonflock.com, add it in Vercel under Settings → Environment Variables and redeploy.",
      };
    }

    if (/rate_limit|429/i.test(message)) {
      return { ok: false, error: "Rate limited by the model. Wait a moment and try again." };
    }

    if (/credit|billing|quota/i.test(message)) {
      return { ok: false, error: "The Anthropic account is out of credit, or its spend limit is reached." };
    }

    return { ok: false, error: message };
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
      sizes: x.sizes ?? {},
      fit: x.fit || null,
      color: x.color || null,
      // Normalised alongside the descriptive one: the first is what a buyer
      // reads, the second is what a dropdown can match.
      color_primary: x.color_primary || null,
      swatch: /^#[0-9a-fA-F]{6}$/.test(x.swatch) ? x.swatch : null,
      material: x.material || null,
      material_primary: x.material_primary || null,
      department: x.department || null,
      condition: x.condition || "good",
      // The model sometimes answers "none" instead of returning an empty array,
      // which then renders as a flaw literally called "none" in a live listing.
      flaws: (x.flaws ?? []).filter(
        (f) => f && !/^(none|n\/?a|no flaws?|none noted)\.?$/i.test(f.trim())
      ),
      status: "draft",
      review_state: "unreviewed",
      acquired_at: new Date().toISOString().slice(0, 10),
      notes: [x.era && `Era: ${x.era}`, x.notes].filter(Boolean).join("\n") || null,
    })
    .select("id, sku")
    .single();

  if (itemError || !item) return { ok: false, error: itemError?.message ?? "Couldn't create the item." };

  const claimed = await claimPhotos(supabase, user.id, item.id, photos);
  if (claimed === 0) {
    await supabase.from("items").delete().eq("id", item.id);
    return { ok: false, error: "Those photos were just filed against another garment." };
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
