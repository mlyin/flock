/**
 * The fields a seller edits on a garment, shared by the web's review form
 * (app/actions.ts confirmItem) and the phone's edit screen
 * (app/api/m/items/[id]). Lives outside app/actions.ts because a "use server"
 * module may only export async functions.
 *
 * A key that is absent is left alone; a key that is blank is cleared.
 */
export const ITEM_FIELDS = [
  "sku",
  "title",
  "brand",
  "category",
  "size",
  "color",
  "material",
  "style_code",
  "condition",
  "cost_basis",
  "list_price",
  "floor_price",
  "target_profit",
  "package_size",
  "source",
  "flaws",
  "notes",
] as const;

export type ItemField = (typeof ITEM_FIELDS)[number];
export type ItemFields = Partial<Record<ItemField, string | number | null>>;

export const isItemField = (key: string): key is ItemField => (ITEM_FIELDS as readonly string[]).includes(key);

/**
 * The JSON body of a PATCH, reduced to the fields this table has. Unknown
 * keys are dropped rather than refused, so an app a version ahead of the
 * server degrades to "that field didn't save" instead of "nothing saved".
 * `flaws` may arrive as a list; the save step wants one line per flaw.
 */
export function pickItemFields(body: Record<string, unknown>): ItemFields {
  const fields: ItemFields = {};
  for (const [key, raw] of Object.entries(body)) {
    if (!isItemField(key)) continue;
    if (key === "flaws" && Array.isArray(raw)) {
      fields.flaws = raw.filter((v): v is string => typeof v === "string").join("\n");
      continue;
    }
    if (typeof raw === "string" || typeof raw === "number" || raw === null) fields[key] = raw;
  }
  return fields;
}
