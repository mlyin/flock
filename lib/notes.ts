import Anthropic from "@anthropic-ai/sdk";
import { MODEL_FAST } from "./inference";

/**
 * Tidy the seller's own words. Never add to them.
 *
 * Sellers type notes one-handed while holding the garment — "shoe has never
 * been worna nd both pairs unworm, no scuffs crease or marks". That sentence
 * contains real information and it should not go onto a listing looking like
 * that. But the fix is a rewrite, not a rewrite-and-embellish: the moment a
 * model adds "excellent condition" or "barely worn" to a sentence the seller
 * never wrote, Flock is making a condition claim on their behalf about an item
 * it has never seen. That is the failure this whole codebase is organised
 * against.
 *
 * So: fix spelling and grammar, merge duplicates, order it sensibly, and stop.
 *
 * Runs on the cheap model. It's a copy-edit, not a judgement — Haiku does it
 * well and a listing-copy-sized bill for punctuation would be absurd.
 */

const SYSTEM = `You are copy-editing a resale seller's private notes about one garment.

YOUR ONLY JOB IS TO MAKE THEIR OWN WORDS READABLE.

Absolutely forbidden:
- Adding any fact, measurement, condition claim, or selling point they did not write.
- Upgrading their language. "no scuffs" must not become "pristine" or "excellent condition".
- Inventing flaws. If they mention none, the flaws list is empty.
- Marketing voice. These are notes, not a listing.

Required:
- Fix spelling, typos and grammar.
- Merge duplicated statements into one.
- Put it in a sensible order, plainly written.
- Keep every fact they did write, including unflattering ones.

FLAWS are specific defects THIS garment has: a stain, a hole, a scuff, a missing
button, pilling. A statement that something is ABSENT ("no scuffs", "no marks",
"never worn") is NOT a flaw — it belongs in the notes. If the seller listed no
actual defects, return an empty flaws array. Never move a fact you had to invent
into either field.

If the notes are already clean, return them essentially unchanged.`;

const SCHEMA = {
  type: "object",
  required: ["notes", "flaws"],
  additionalProperties: false,
  properties: {
    notes: { type: "string", description: "The seller's notes, copy-edited. Plain prose." },
    flaws: {
      type: "array",
      description: "Actual defects the seller described, one per entry. Empty if they described none.",
      items: { type: "string" },
    },
  },
} as const;

export type TidiedNotes = { notes: string; flaws: string[] };

export async function tidyNotes(input: {
  notes: string;
  flaws: string[];
  /** Context so the edit doesn't garble a brand or size it doesn't recognise. */
  title?: string | null;
  brand?: string | null;
  category?: string | null;
  size?: string | null;
}): Promise<{ result: TidiedNotes; model: string }> {
  const raw = [
    input.notes?.trim() ? `Notes as typed:\n${input.notes.trim()}` : null,
    input.flaws.length ? `Flaws as typed:\n${input.flaws.join("\n")}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  if (!raw) throw new Error("There's nothing written to tidy up yet.");

  // Facts are supplied so the model doesn't "correct" a real brand into a more
  // common one — not as material to write from.
  const facts = [
    input.title ? `Item: ${input.title}` : null,
    input.brand ? `Brand: ${input.brand}` : null,
    input.category ? `Category: ${input.category}` : null,
    input.size ? `Size: ${input.size}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await new Anthropic().messages.create({
    model: MODEL_FAST,
    max_tokens: 1500,
    system: SYSTEM,
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    messages: [
      {
        role: "user",
        content: `${facts ? `For reference only, do not write from these:\n${facts}\n\n` : ""}${raw}\n\nCopy-edit the seller's words.`,
      },
    ],
  });

  if (response.stop_reason === "refusal") throw new Error("The model declined to edit these notes.");

  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("Nothing came back from the edit.");

  const parsed = JSON.parse(text.text) as TidiedNotes;
  return {
    result: { notes: parsed.notes ?? "", flaws: Array.isArray(parsed.flaws) ? parsed.flaws : [] },
    model: response.model,
  };
}
