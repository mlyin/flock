/**
 * Applies supabase/migrations/*.sql in filename order, once each.
 *
 *   node scripts/migrate.mjs          apply anything unapplied
 *   node scripts/migrate.mjs --dry    list what would run
 *
 * Each file runs inside a transaction, so a syntax error halfway through leaves
 * the database exactly as it was rather than half-migrated.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

// import.meta.dirname only exists from Node 20.11. On 18 it is undefined, and
// path.resolve then throws "paths[0] must be of type string" — which reads like
// a missing database URL but isn't. Derive it from import.meta.url instead so
// this runs on whatever node the shell happens to have.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const DIR = path.join(ROOT, "supabase", "migrations");
const DRY = process.argv.includes("--dry");

// Next loads .env.local automatically; a plain node script does not.
for (const file of [".env.local", ".env"]) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) continue;
  for (const line of fs.readFileSync(full, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error(
    "SUPABASE_DB_URL isn't set.\n" +
      "Supabase dashboard → Project Settings → Database → Connection string → URI,\n" +
      "then paste it into .env.local (see .env.example)."
  );
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

await client.query(`
  create table if not exists schema_migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )
`);

// Supabase exposes every public table through PostgREST. RLS on with no policies
// means the anon and publishable keys can't read it at all, while this script —
// connecting as the table owner — still can.
await client.query(`alter table schema_migrations enable row level security`);

const applied = new Set(
  (await client.query("select name from schema_migrations")).rows.map((r) => r.name)
);

const pending = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .filter((f) => !applied.has(f));

if (pending.length === 0) {
  console.log(`up to date — ${applied.size} migration(s) already applied`);
  await client.end();
  process.exit(0);
}

if (DRY) {
  console.log("would apply:");
  for (const file of pending) console.log(`  ${file}`);
  await client.end();
  process.exit(0);
}

for (const file of pending) {
  const sql = fs.readFileSync(path.join(DIR, file), "utf8");
  process.stdout.write(`applying ${file} … `);
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("insert into schema_migrations (name) values ($1)", [file]);
    await client.query("commit");
    console.log("ok");
  } catch (error) {
    await client.query("rollback");
    console.log("FAILED");
    console.error(`\n${error.message}\n`);
    console.error("Nothing from this file was applied. Fix it and re-run.");
    await client.end();
    process.exit(1);
  }
}

await client.end();
console.log(`done — ${pending.length} migration(s) applied`);
