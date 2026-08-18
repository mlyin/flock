"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Answering an offer.
 *
 * Threader records the decision and the maths behind it; it does not click
 * Accept on the marketplace. That's the same boundary the extension holds when
 * it fills a form but never submits it — it's the seller's account, and the
 * action should come from their browser. The UI pairs every button here with a
 * deep link to the page where the real button lives.
 *
 * Recording it here is still worth doing: it's what stops the same offer being
 * answered twice, and it's the audit trail the auto-negotiator will need.
 */

export type OfferOutcome = { ok: true } | { ok: false; error: string };

type Answer = "accepted" | "declined" | "countered";

export async function answerOffer(
  messageId: string,
  answer: Answer,
  counterAmount?: number
): Promise<OfferOutcome> {
  if (answer === "countered" && (!counterAmount || counterAmount <= 0)) {
    return { ok: false, error: "A counter needs an amount." };
  }

  const supabase = await supabaseServer();

  // Read first so we can refuse to counter below the seller's own floor. The
  // floor exists precisely so this decision isn't made from memory at 11pm.
  const { data: row, error: readError } = await supabase
    .from("messages")
    .select("id, kind, offer_amount, items (floor_price)")
    .eq("id", messageId)
    .single();

  if (readError || !row) return { ok: false, error: "Couldn't find that offer." };
  if (row.kind !== "offer") return { ok: false, error: "That message isn't an offer." };

  if (answer === "countered") {
    const item = Array.isArray(row.items) ? row.items[0] : row.items;
    const floor = item?.floor_price == null ? null : Number(item.floor_price);
    if (floor !== null && counterAmount! < floor) {
      return {
        ok: false,
        error: `That's below your $${floor.toFixed(2)} floor. Raise the counter or lower the floor.`,
      };
    }
  }

  const { error } = await supabase
    .from("messages")
    .update({
      offer_status: answer,
      counter_amount: answer === "countered" ? counterAmount : null,
      responded_at: new Date().toISOString(),
      responded_via: "threader",
      read_at: new Date().toISOString(),
    })
    .eq("id", messageId);

  if (error) {
    // The most likely cause by far is migration 0009 not having been applied.
    return {
      ok: false,
      error: /column .* does not exist/i.test(error.message)
        ? "Run `npm run migrate` — the offers migration (0009) hasn't been applied yet."
        : error.message,
    };
  }

  revalidatePath("/inbox");
  revalidatePath("/");
  return { ok: true };
}

/** Mark a message read without answering it. */
export async function markMessageRead(messageId: string): Promise<OfferOutcome> {
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("id", messageId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/inbox");
  return { ok: true };
}

/**
 * Tie a message to a garment by hand. Matching is deliberately manual: a
 * message shown against the wrong item corrupts the net-proceeds maths, and a
 * wrong auto-match is harder to notice than no match at all.
 */
export async function matchMessageToItem(messageId: string, itemId: string): Promise<OfferOutcome> {
  const supabase = await supabaseServer();
  const { error } = await supabase.from("messages").update({ item_id: itemId }).eq("id", messageId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/inbox");
  revalidatePath(`/items/${itemId}`);
  return { ok: true };
}
