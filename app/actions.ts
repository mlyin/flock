"use server";

import path from "node:path";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { identifyGarment } from "@/lib/inference";
import { INBOX, createDraftItem, resolvePhoto } from "@/lib/intake";

export type AnalyzeResult =
  | { ok: true; itemId: number; sku: string; questions: string[] }
  | { ok: false; error: string };

/** Inbox filenames in → one unreviewed draft item out. */
export async function analyzeInboxPhotos(fileNames: string[]): Promise<AnalyzeResult> {
  try {
    if (fileNames.length === 0) return { ok: false, error: "Select at least one photo." };

    const paths = fileNames.map((name) => {
      const full = resolvePhoto(path.join("inbox", path.basename(name)));
      if (!full || path.dirname(full) !== INBOX) throw new Error(`Not an inbox photo: ${name}`);
      return full;
    });

    const result = await identifyGarment(paths);
    const { itemId, sku } = createDraftItem(paths, result);

    revalidatePath("/inbox");
    revalidatePath("/");
    return { ok: true, itemId, sku, questions: result.extraction.questions ?? [] };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Accept the draft, with whatever corrections the seller made. */
export async function confirmItem(formData: FormData) {
  const id = Number(formData.get("id"));
  const value = (key: string) => {
    const raw = formData.get(key);
    const text = typeof raw === "string" ? raw.trim() : "";
    return text === "" ? null : text;
  };

  const flaws = String(formData.get("flaws") ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  db()
    .prepare(
      `UPDATE items SET title = ?, brand = ?, category = ?, size = ?, color = ?,
                        material = ?, condition = ?, cost_basis = ?, source = ?,
                        flaws = ?, notes = ?, review_state = 'confirmed'
       WHERE id = ?`
    )
    .run(
      value("title") ?? "Untitled",
      value("brand"),
      value("category") ?? "Other",
      value("size"),
      value("color"),
      value("material"),
      value("condition") ?? "good",
      Number(formData.get("cost_basis") ?? 0) || 0,
      value("source"),
      JSON.stringify(flaws),
      value("notes"),
      id
    );

  revalidatePath(`/items/${id}`);
  revalidatePath("/");
}
