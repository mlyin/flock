import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "closet.db");

// Next's dev server re-evaluates modules on hot reload; without this you leak
// a file handle per edit until SQLite starts refusing to open.
const cache = globalThis as unknown as { __closetDb?: DatabaseSync };

export function db(): DatabaseSync {
  if (cache.__closetDb) return cache.__closetDb;

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const conn = new DatabaseSync(DB_PATH);
  conn.exec("PRAGMA foreign_keys = ON;");
  conn.exec("PRAGMA journal_mode = WAL;");
  conn.exec(fs.readFileSync(path.join(process.cwd(), "lib", "schema.sql"), "utf8"));
  migrate(conn);

  cache.__closetDb = conn;
  return conn;
}

/**
 * `CREATE TABLE IF NOT EXISTS` won't add a column to a table that already exists,
 * so columns introduced after the first run get added here. Additive only — this
 * is a personal tool, not a product with a migration story.
 */
function migrate(conn: DatabaseSync) {
  const columns = (table: string) =>
    new Set((conn.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name));

  const itemColumns = columns("items");
  if (!itemColumns.has("review_state")) {
    conn.exec(`ALTER TABLE items ADD COLUMN review_state TEXT NOT NULL DEFAULT 'confirmed'`);
  }
}

// node:sqlite rejects a params object on a statement that takes none, so only
// pass one through when the caller actually supplied it.
export function all<T>(sql: string, params?: Record<string, SQLInputValue>): T[] {
  const stmt = db().prepare(sql);
  return (params ? stmt.all(params) : stmt.all()) as T[];
}

export function one<T>(sql: string, params?: Record<string, SQLInputValue>): T | undefined {
  const stmt = db().prepare(sql);
  return (params ? stmt.get(params) : stmt.get()) as T | undefined;
}
