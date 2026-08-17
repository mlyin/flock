"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { BUCKET, identifyAndDraft, type IdentifyOutcome } from "@/lib/intake";

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
