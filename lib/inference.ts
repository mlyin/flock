import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

/**
 * Photo → structured garment record.
 *
 * Two rules this file exists to enforce:
 *   1. The model returns JSON matching a fixed schema, never prose we have to parse.
 *   2. Anything it isn't sure about comes back as a question, not a confident guess.
 *      Brand is the field to be paranoid about — a wrong brand is a wrong price.
 */

export const MODEL = "claude-opus-5";

/**
 * Long-edge pixels sent to the model. Care-label text is the hardest thing in the
 * frame to read, and it's also the highest-value field, so this is deliberately
 * generous. Drop it to ~1200 if you want cheaper calls and don't shoot tags.
 */
const MAX_EDGE = 2000;

export const CATEGORIES = [
  "Outerwear", "Denim", "Tops", "Knitwear", "Shirts", "Sweats", "Fleece",
  "Trousers", "Dresses", "Activewear", "Footwear", "Accessories", "Other",
] as const;

export const CONDITIONS = ["nwt", "excellent", "good", "fair"] as const;

const CONFIDENCE_FIELDS = ["brand", "category", "size", "color", "material", "condition"] as const;

export type Extraction = {
  title: string;
  brand: string;
  category: (typeof CATEGORIES)[number];
  size: string;
  color: string;
  /**
   * The same colour, snapped to a vocabulary a marketplace dropdown contains.
   * `color` is what a buyer reads ("faded black"); this is what a form matches.
   */
  color_primary: (typeof COLORS)[number];
  swatch: string;
  material: string;
  material_primary: (typeof MATERIALS)[number];
  /** Gates category matching on Grailed and Vinted — see the schema note. */
  department: (typeof DEPARTMENTS)[number];
  condition: (typeof CONDITIONS)[number];
  era: string;
  flaws: string[];
  questions: string[];
  notes: string;
  confidence: Record<(typeof CONFIDENCE_FIELDS)[number], number>;
};

/**
 * Fixed vocabularies for the normalised fields.
 *
 * Drawn from the marketplace dropdowns themselves (Vinted's colour and
 * material panels, read live 18 Aug 2026), not invented. A value here is one
 * a form will actually contain; a value outside it is a field left blank.
 */
export const COLORS = [
  "Black", "Grey", "White", "Cream", "Beige", "Brown", "Tan", "Navy", "Blue",
  "Green", "Yellow", "Orange", "Red", "Pink", "Purple", "Silver", "Gold",
  "Khaki", "Burgundy", "Multi",
] as const;

export const MATERIALS = [
  "Cotton", "Polyester", "Wool", "Cashmere", "Linen", "Silk", "Denim",
  "Leather", "Nylon", "Acrylic", "Viscose", "Elastane", "Fleece", "Velvet",
  "Satin", "Suede", "Corduroy", "Other",
] as const;

/** Who the garment is cut for. Gates category matching on Grailed and Vinted. */
export const DEPARTMENTS = ["women", "men", "unisex", "kids"] as const;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title", "brand", "category", "size", "color", "color_primary", "swatch",
    "material", "material_primary", "department", "condition", "era", "flaws",
    "questions", "notes", "confidence",
  ],
  properties: {
    title: {
      type: "string",
      description:
        "A listing title a reseller would write: brand, garment, and any defining detail. No filler words like 'Vintage' unless the piece genuinely is.",
    },
    brand: {
      type: "string",
      description:
        "ONLY if you can read it on a tag, label, or woven logo in a photo. Never infer a brand from styling, silhouette, or fabric. Empty string if no brand is legible.",
    },
    category: { type: "string", enum: [...CATEGORIES] },
    size: {
      type: "string",
      description: "As printed on the tag (S, 34x32, UK 8, 42). Empty string if no size tag is visible.",
    },
    color: { type: "string", description: "How a seller would describe it — 'faded black', 'British tan'." },
    color_primary: {
      type: "string",
      enum: [...COLORS],
      description:
        "The single closest colour from the list. This one gets matched against marketplace dropdowns, so it must come from the list even when the real colour sits between two — an approximate match fills the field, an exact phrase nobody lists leaves it empty.",
    },
    swatch: { type: "string", description: "Hex code approximating the dominant colour, e.g. #7A5C37." },
    material: { type: "string", description: "From the care label if legible, otherwise your read of the fabric." },
    material_primary: {
      type: "string",
      enum: [...MATERIALS],
      description:
        "The dominant fibre, from the list. A blend takes whichever fibre leads the care label. Other only when nothing fits.",
    },
    department: {
      type: "string",
      enum: [...DEPARTMENTS],
      description:
        "Who the garment is cut for, from the tag section, the cut, or the sizing convention. This gates category matching: Grailed opens with Menswear or Womenswear and has no neutral option, and a Vinted search for a garment type returns mostly men's rows. Say unisex when it genuinely is, never as a hedge — an honest unisex still matches, a hedged one puts a women's garment in Men's.",
    },
    condition: {
      type: "string",
      enum: [...CONDITIONS],
      description:
        "nwt = tags attached. excellent = no visible wear. good = light wear, no significant damage. fair = obvious flaws that must be disclosed.",
    },
    era: { type: "string", description: "Only if a tag design or construction detail dates it. Empty string otherwise." },
    flaws: {
      type: "array",
      items: { type: "string" },
      description:
        "Every visible defect, each specific enough to write into a listing: 'fraying at left cuff', not 'some wear'. Empty array if genuinely clean.",
    },
    questions: {
      type: "array",
      items: { type: "string" },
      description:
        "What you could not determine and need the seller to check in person. Ask about anything you scored below 0.7. Empty array only if you are confident about everything.",
    },
    notes: { type: "string", description: "Anything that affects value and doesn't belong in another field." },
    confidence: {
      type: "object",
      additionalProperties: false,
      required: [...CONFIDENCE_FIELDS],
      properties: Object.fromEntries(
        CONFIDENCE_FIELDS.map((f) => [f, { type: "number", description: `0 to 1 — how sure you are of ${f}.` }])
      ),
    },
  },
} as const;

const SYSTEM = `You identify secondhand clothing from photographs so it can be resold.

You are looking at one physical garment, photographed once or more. Typically one photo shows the garment and another shows its brand or care tag.

Be accurate rather than complete. An empty field the seller fills in themselves costs them ten seconds; a wrong brand or a missed flaw costs them a return, a bad review, or a listing priced at half what it's worth.

- Brand comes from a tag, label, or woven logo you can actually read. A garment that "looks like Carhartt" is not Carhartt.
- Report every flaw you can see. Sellers get burned by the ones nobody disclosed.
- Score your confidence honestly. A 0.5 you flag is far more useful than a 0.9 you invented.
- Anything you scored below 0.7 becomes a question for the seller, who has the garment in their hands and can check.`;

const MEDIA: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/webp",
};

export class UnsupportedPhotoError extends Error {}

async function encode(image: GarmentPhoto) {
  const ext = path.extname(image.name).toLowerCase();
  if (ext === ".heic" || ext === ".heif") {
    throw new UnsupportedPhotoError(
      `${image.name} is HEIC. Set your phone camera to "Most Compatible" (JPEG), or convert it first.`
    );
  }
  if (ext && !MEDIA[ext]) {
    throw new UnsupportedPhotoError(`${image.name} isn't an image type the model reads (${ext}).`);
  }

  // Resize before encoding: keeps us inside the request size limit and stops a
  // 12-megapixel phone photo costing more tokens than the answer is worth.
  const buffer = await sharp(image.data)
    .rotate() // honour EXIF orientation — phone photos are frequently sideways otherwise
    .resize(MAX_EDGE, MAX_EDGE, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();

  return buffer.toString("base64");
}

export type InferenceResult = {
  extraction: Extraction;
  model: string;
  raw: string;
  usage: { input: number; output: number };
};

export type GarmentPhoto = { name: string; data: Buffer };

export async function identifyGarment(photos: GarmentPhoto[]): Promise<InferenceResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY isn't set. Put it in .env.local at the project root and restart the dev server."
    );
  }
  if (photos.length === 0) throw new Error("No photos to look at.");

  const client = new Anthropic();

  const content: Anthropic.ContentBlockParam[] = [];
  for (const photo of photos) {
    content.push({ type: "text", text: `Photo: ${photo.name}` });
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: await encode(photo) },
    });
  }
  content.push({
    type: "text",
    text: "Identify this garment. Leave fields empty rather than guessing, and turn every uncertainty into a question.",
  });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    output_config: {
      // `medium` is a deliberate default: extraction is not a reasoning-heavy task
      // and this runs on every photo. Raise it if the reads come back sloppy.
      effort: "medium",
      format: { type: "json_schema", schema: SCHEMA },
    },
    messages: [{ role: "user", content }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The model declined to describe these photos.");
  }

  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error(`No text came back (stop_reason: ${response.stop_reason}).`);
  }

  return {
    extraction: JSON.parse(text.text) as Extraction,
    model: response.model,
    raw: text.text,
    usage: { input: response.usage.input_tokens, output: response.usage.output_tokens },
  };
}
