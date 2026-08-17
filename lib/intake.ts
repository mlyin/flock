import fs from "node:fs";
import path from "node:path";
import { db, one } from "./db";
import type { InferenceResult } from "./inference";

export const PHOTOS_ROOT = path.join(process.cwd(), "photos");
export const INBOX = path.join(PHOTOS_ROOT, "inbox");
export const ITEMS = path.join(PHOTOS_ROOT, "items");

/** Reject anything that escapes the photos directory before it reaches the filesystem. */
export function resolvePhoto(relative: string): string | null {
  const full = path.resolve(PHOTOS_ROOT, relative);
  const root = path.resolve(PHOTOS_ROOT);
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  return full;
}

function nextSku(): string {
  const row = one<{ sku: string }>(`SELECT sku FROM items ORDER BY sku DESC LIMIT 1`);
  const n = row ? Number(row.sku.replace(/\D/g, "")) + 1 : 1;
  return `CL-${String(n).padStart(4, "0")}`;
}

/** Never overwrite: if the name is taken, suffix it. */
function uniquePath(dir: string, name: string): string {
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  let candidate = path.join(dir, name);
  let n = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base}-${n}${ext}`);
    n += 1;
  }
  return candidate;
}

export type IntakeResult = { itemId: number; sku: string };

/**
 * Turn one inference into an unreviewed draft item: move its photos out of the
 * inbox, write the record, and keep the raw model output for the audit trail.
 */
export function createDraftItem(
  inboxPaths: string[],
  result: InferenceResult
): IntakeResult {
  const conn = db();
  const { extraction: x } = result;
  const sku = nextSku();

  const destDir = path.join(ITEMS, sku);
  fs.mkdirSync(destDir, { recursive: true });

  conn.exec("BEGIN");
  try {
    const itemId = Number(
      conn
        .prepare(
          `INSERT INTO items (sku, title, brand, category, size, color, swatch, material,
                              condition, flaws, cost_basis, acquired_at, source, status, review_state, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, date('now'), ?, 'draft', 'unreviewed', ?)`
        )
        .run(
          sku,
          x.title || "Untitled",
          x.brand || null,
          x.category || "Other",
          x.size || null,
          x.color || null,
          /^#[0-9a-fA-F]{6}$/.test(x.swatch) ? x.swatch : null,
          x.material || null,
          x.condition || "good",
          JSON.stringify(x.flaws ?? []),
          "inbox",
          [x.era && `Era: ${x.era}`, x.notes].filter(Boolean).join("\n") || null
        ).lastInsertRowid
    );

    const insertPhoto = conn.prepare(
      `INSERT INTO photos (item_id, path, role, sort_order) VALUES (?, ?, ?, ?)`
    );

    inboxPaths.forEach((source, index) => {
      const dest = uniquePath(destDir, path.basename(source));
      fs.renameSync(source, dest);
      const relative = path.relative(PHOTOS_ROOT, dest).split(path.sep).join("/");
      insertPhoto.run(itemId, relative, index === 0 ? "hero" : "detail", index);
    });

    conn
      .prepare(
        `INSERT INTO inferences (item_id, source_path, model, fields, confidence, raw)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        itemId,
        inboxPaths.map((p) => path.basename(p)).join(", "),
        result.model,
        JSON.stringify(x),
        JSON.stringify(x.confidence ?? {}),
        result.raw
      );

    conn.exec("COMMIT");
    return { itemId, sku };
  } catch (error) {
    conn.exec("ROLLBACK");
    throw error;
  }
}

export type InferenceRow = {
  id: number;
  item_id: number;
  model: string;
  fields: string;
  confidence: string;
  created_at: string;
};

export function latestInference(itemId: number): InferenceRow | undefined {
  return one<InferenceRow>(
    `SELECT * FROM inferences WHERE item_id = :id ORDER BY id DESC LIMIT 1`,
    { id: itemId }
  );
}
