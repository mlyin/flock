import Anthropic from "@anthropic-ai/sdk";
import { MODEL_FAST } from "./inference";
import { CHANNEL_LABEL } from "./fees";
import type { ScoredOffer } from "./offers";
import type { Verdict } from "./negotiate";

/**
 * Turn a decision into a sentence a stranger will read.
 *
 * The decision is already made — lib/negotiate.ts did the arithmetic. This
 * writes it down, and that is the whole job. The model is given the move and
 * the number and is not allowed to change either.
 *
 * The hard constraint is the same one that governs listing copy: it must not
 * invent anything about the garment. A reply that says "it's in great shape,
 * barely worn" is a condition claim made to a buyer by software that has never
 * seen the item, and on a resale platform that is the beginning of a dispute.
 *
 * Cheap model on purpose. This is two sentences of ordinary politeness.
 */

const SYSTEM = `You write short replies to buyers haggling on a resale marketplace, in the seller's voice.

THE DECISION IS ALREADY MADE. You are given the move and, for a counter, the exact number. Never change the number, never suggest a different move, never hedge about whether the seller is sure.

Absolutely forbidden:
- Any claim about the item's condition, authenticity, age, fit or history. You have not seen it.
- Inventing a reason ("I paid a lot for it", "I've had lots of interest"). You do not know if that is true.
- Mentioning fees, floor prices, cost basis, profit, or anything about the seller's economics. That is private.
- Apologising at length, or begging.

Required:
- Two sentences at most. Usually one.
- Plain, warm, unfussy. How a person texts, not how a brand emails.
- For a counter: state the number clearly.
- For a decline: kind and final, no false hope.
- For an accept: friendly and brief, and say what happens next only if it is obvious (they can buy it / it's yours).
- No emoji unless the buyer used one first.
- Never open with "Thanks for reaching out" or similar customer-service filler.`;

const SCHEMA = {
  type: "object",
  required: ["reply"],
  additionalProperties: false,
  properties: {
    reply: { type: "string", description: "The message to send. Two sentences at most." },
  },
} as const;

export async function draftReply(
  offer: ScoredOffer,
  verdict: Verdict
): Promise<{ reply: string; model: string }> {
  const move =
    verdict.move === "counter"
      ? `COUNTER at exactly $${verdict.counterAt?.toFixed(2)}`
      : verdict.move === "accept"
        ? "ACCEPT their offer"
        : verdict.move === "decline"
          ? "DECLINE, politely and finally"
          : "ASK the buyer a clarifying question";

  // The buyer's own words, so the reply answers what they actually said —
  // and nothing about the seller's economics goes anywhere near the model.
  const context = [
    `Marketplace: ${CHANNEL_LABEL[offer.channel]}`,
    offer.item?.title ? `Item: ${offer.item.title}` : null,
    offer.item?.list_price != null ? `Listed at: $${Number(offer.item.list_price).toFixed(2)}` : null,
    `They offered: $${offer.amount.toFixed(2)}`,
    offer.row.body ? `They wrote: "${String(offer.row.body).slice(0, 400)}"` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await new Anthropic().messages.create({
    model: MODEL_FAST,
    max_tokens: 400,
    system: SYSTEM,
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: `${context}\n\nYour move: ${move}.\n\nWrite the reply.` }],
  });

  if (response.stop_reason === "refusal") throw new Error("The model declined to write this reply.");

  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("No reply came back.");

  return { reply: (JSON.parse(text.text) as { reply: string }).reply, model: response.model };
}
