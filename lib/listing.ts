import Anthropic from "@anthropic-ai/sdk";
import type { Channel } from "./fees";

/**
 * One garment record → listing copy for each channel.
 *
 * The channels want genuinely different things. eBay is a search engine: buyers
 * type "carhartt detroit jacket XL brown" and the title is the entire ranking
 * signal. Depop is a feed: buyers scroll, and copy that reads like an eBay title
 * looks like a bot. Same garment, same facts, two different voices — which is
 * why this generates both from one record rather than reusing one string.
 */

export const LISTABLE: Channel[] = ["ebay", "depop"];

export const CHANNEL_BRIEF: Record<"ebay" | "depop", string> = {
  ebay: "Keyword-dense and literal. Buyers arrive by search, so the title carries brand, garment, size, colour, and any collectible detail. No slang, no personality.",
  depop: "Conversational and scroll-stopping. Buyers browse a feed, so lead with the vibe and the fit. Lowercase is normal. Never sound like a catalogue.",
};

export type ListingDraft = {
  ebay: { title: string; description: string; category: string; specifics: Record<string, string> };
  depop: { title: string; description: string; tags: string[] };
  price: { low: number; suggested: number; high: number; reasoning: string };
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ebay", "depop", "price"],
  properties: {
    ebay: {
      type: "object",
      additionalProperties: false,
      required: ["title", "description", "category", "specifics"],
      properties: {
        title: {
          type: "string",
          description:
            "Maximum 80 characters — eBay truncates past that. Front-load brand and garment type; include size and colour if they fit. No ALL CAPS, no punctuation padding.",
        },
        description: {
          type: "string",
          description:
            "Plain paragraphs. Condition and every flaw stated explicitly — undisclosed flaws cause returns. Include measurements as placeholders like [chest: __] for the seller to fill.",
        },
        category: { type: "string", description: "The eBay category path you'd expect, e.g. 'Clothing > Men > Coats & Jackets'." },
        specifics: {
          type: "object",
          additionalProperties: false,
          required: ["Brand", "Size", "Colour", "Material", "Type", "Department"],
          properties: {
            Brand: { type: "string" },
            Size: { type: "string" },
            Colour: { type: "string" },
            Material: { type: "string" },
            Type: { type: "string" },
            Department: { type: "string", description: "Men, Women, Unisex, or Kids — say Unisex if genuinely unclear." },
          },
        },
      },
    },
    depop: {
      type: "object",
      additionalProperties: false,
      required: ["title", "description", "tags"],
      properties: {
        title: { type: "string", description: "Short and human. How a seller would caption it, not how a catalogue would name it." },
        description: {
          type: "string",
          description:
            "Under 900 characters. Conversational. Still state condition and every flaw honestly — Depop buyers leave reviews.",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Exactly 5, lowercase, no # symbol. What a buyer would actually search on Depop — brands, styles, eras.",
        },
      },
    },
    price: {
      type: "object",
      additionalProperties: false,
      required: ["low", "suggested", "high", "reasoning"],
      properties: {
        low: { type: "number", description: "Price it would move at quickly." },
        suggested: { type: "number", description: "Your recommendation." },
        high: { type: "number", description: "Achievable to the right buyer with patience." },
        reasoning: {
          type: "string",
          description:
            "One or two sentences. Say plainly that this is judgement without sold-comp data, and name what would sharpen it.",
        },
      },
    },
  },
} as const;

const SYSTEM = `You write listings for a secondhand clothing seller.

You are given one garment's record. Produce copy for eBay and for Depop, and a price range.

- Disclose every flaw in both descriptions. A returned item costs the seller far more than a slightly lower price.
- Never invent facts. If the record has no material, don't guess one into the copy — write around it.
- eBay: ${CHANNEL_BRIEF.ebay}
- Depop: ${CHANNEL_BRIEF.depop}

On price: you have no sold-comp data, only the garment and your own sense of the resale market. Say so in the reasoning rather than implying more confidence than you have. A seller who knows the number is a guess will check it; one who thinks it's data won't.`;

export type ListingItem = {
  title: string;
  brand: string | null;
  category: string;
  size: string | null;
  color: string | null;
  material: string | null;
  condition: string;
  flaws: string[];
  notes: string | null;
};

export async function draftListings(item: ListingItem): Promise<{
  draft: ListingDraft;
  model: string;
  usage: { input: number; output: number };
}> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY isn't set.");
  }

  const facts = [
    `Title: ${item.title}`,
    `Brand: ${item.brand ?? "not identified"}`,
    `Category: ${item.category}`,
    `Size: ${item.size ?? "not identified"}`,
    `Colour: ${item.color ?? "not identified"}`,
    `Material: ${item.material ?? "not identified"}`,
    `Condition: ${item.condition}`,
    `Flaws: ${item.flaws.length ? item.flaws.join("; ") : "none noted"}`,
    item.notes ? `Notes: ${item.notes}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await new Anthropic().messages.create({
    model: "claude-opus-5",
    max_tokens: 8000,
    system: SYSTEM,
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: `${facts}\n\nWrite the listings.` }],
  });

  if (response.stop_reason === "refusal") throw new Error("The model declined to write this listing.");

  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error(`No copy came back (stop_reason: ${response.stop_reason}).`);

  return {
    draft: JSON.parse(text.text) as ListingDraft,
    model: response.model,
    usage: { input: response.usage.input_tokens, output: response.usage.output_tokens },
  };
}
