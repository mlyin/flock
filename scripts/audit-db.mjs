/**
 * Proves what a signed-in seller can actually do to the database.
 *
 *   npm run audit:db
 *
 * Not a catalog read. Catalog reads are how the two holes this script now
 * guards got missed in the first place: `channel_accounts` carried a comment
 * saying its tokens were server-only while the policy said otherwise, and a
 * `revoke select (token_hash)` returned success without revoking anything,
 * because a column-level revoke cannot carve a hole out of a table-level
 * grant.
 *
 * So every check below actually performs the operation, as the `authenticated`
 * role, with a forged `request.jwt.claims` — exactly the context PostgREST
 * builds for a request carrying the publishable key and a session. Everything
 * runs inside a transaction that is always rolled back, so the audit never
 * changes a row.
 *
 * Exit 1 on any violation, so CI or an agent can run it unattended.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

for (const file of [".env.local", ".env"]) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) continue;
  for (const line of fs.readFileSync(full, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

if (!process.env.SUPABASE_DB_URL) {
  console.error("SUPABASE_DB_URL is not set (see .env.example).");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const violations = [];
const notes = [];

/**
 * Run one statement as a signed-in seller and report what happened.
 *
 * Always rolled back. Three outcomes, not two, because conflating them is a
 * bug I wrote into the first version of this script: a read that returns
 * nothing because the table is EMPTY looks identical to one that returns
 * nothing because RLS filtered it, and only one of those is a security
 * property.
 *
 *   denied    — Postgres refused it. The grants did the work.
 *   filtered  — it ran, and row-level security left nothing behind.
 *   permitted — it ran and returned rows.
 *
 * `expect` is one of those three. "permitted" also accepts an empty result,
 * since a table nobody has written to yet cannot return rows — but it says so,
 * because a check that cannot fail is not evidence.
 */
async function asSeller(userId, description, expect, sql, params = []) {
  await client.query("begin");
  await client.query("set local role authenticated");
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: userId, role: "authenticated" }),
  ]);

  let outcome;
  let detail = "";
  try {
    const result = await client.query(sql, params);
    outcome = result.rowCount === 0 ? "filtered" : "permitted";
  } catch (error) {
    outcome = "denied";
    detail = error.message.split("\n")[0];
  }
  await client.query("rollback");

  // A statement that ran but had nothing to act on satisfies "permitted" —
  // the permission was there, the data wasn't.
  const vacuous = expect === "permitted" && outcome === "filtered";
  const ok = outcome === expect || vacuous;

  const mark = ok ? (vacuous ? "--  " : "ok  ") : "FAIL";
  const shown = vacuous ? "permitted (no rows to act on)" : outcome;
  console.log(`  ${mark} ${description.padEnd(46)} ${shown}${detail ? ` — ${detail}` : ""}`);

  if (vacuous) notes.push(`"${description}" had no rows to act on — check was vacuous`);
  if (!ok) violations.push(`${description}: expected ${expect}, got ${outcome}`);
}

const { rows: profiles } = await client.query("select id from public.profiles limit 1");
if (profiles.length === 0) {
  console.error("No profile rows — sign in once so there is a seller to impersonate.");
  await client.end();
  process.exit(1);
}
const seller = profiles[0].id;

console.log("Billing columns are server-owned");
await asSeller(seller, "seller cannot set their own plan", "denied",
  "update public.profiles set plan = 'mutton' where id = $1 returning 1", [seller]);
await asSeller(seller, "seller cannot grant themselves beta", "denied",
  "update public.profiles set beta = true where id = $1 returning 1", [seller]);
await asSeller(seller, "seller cannot rewrite their stripe customer", "denied",
  "update public.profiles set stripe_customer_id = 'cus_x' where id = $1 returning 1", [seller]);
await asSeller(seller, "seller can still edit their display name", "permitted",
  "update public.profiles set display_name = display_name where id = $1 returning 1", [seller]);
await asSeller(seller, "seller can still read their own plan", "permitted",
  "select plan from public.profiles where id = $1", [seller]);

console.log("\nCredentials are not readable from a session");
await asSeller(seller, "marketplace refresh_token unreadable", "denied",
  "select refresh_token from public.channel_accounts limit 1");
await asSeller(seller, "marketplace access_token unreadable", "denied",
  "select access_token from public.channel_accounts limit 1");
await asSeller(seller, "extension token_hash unreadable", "denied",
  "select token_hash from public.extension_tokens limit 1");
await asSeller(seller, "channel connection metadata readable", "permitted",
  "select channel, connected_at from public.channel_accounts limit 1");
await asSeller(seller, "paired device metadata readable", "permitted",
  "select id, label from public.extension_tokens limit 1");

console.log("\nOrdinary inventory still works");
await asSeller(seller, "seller reads their own items", "permitted",
  "select id from public.items where user_id = $1 limit 1", [seller]);
await asSeller(seller, "seller reads their own listings", "permitted",
  "select id from public.listings where user_id = $1 limit 1", [seller]);

console.log("\nTenant isolation holds");
// The nightmare case, stated as a query: another seller's rows must be
// invisible even when named explicitly.
const { rows: others } = await client.query(
  "select id from public.profiles where id <> $1 limit 1",
  [seller]
);
if (others.length === 0) {
  notes.push("only one seller in this database — cross-tenant reads were not exercised");
  console.log("  --   only one seller exists; cross-tenant checks skipped");
} else {
  const other = others[0].id;
  const { rows: theirs } = await client.query(
    "select count(*)::int n from public.items where user_id = $1",
    [other]
  );
  if (theirs[0].n === 0) {
    notes.push(
      "the other seller owns no items, so the cross-tenant read below proves " +
        "nothing on its own — it would pass against an empty table too"
    );
  }
  await asSeller(seller, "cannot read another seller's items", "filtered",
    "select id from public.items where user_id = $1 limit 1", [other]);
  await asSeller(seller, "cannot read another seller's sales", "filtered",
    "select id from public.sales where user_id = $1 limit 1", [other]);
  await asSeller(seller, "cannot read another seller's profile", "filtered",
    "select id from public.profiles where id = $1", [other]);
  await asSeller(seller, "cannot write into another seller's inventory", "filtered",
    "update public.items set title = title where user_id = $1 returning 1", [other]);
}

console.log("\nA consigned garment cannot be listed elsewhere");
// Against a throwaway item, so the positive cases are real. The first version
// of this ran against an existing row and every "should be allowed" case died
// on a unique constraint instead — passing for the wrong reason would have
// been worse, since it would have looked like coverage.
async function custodyCase(description, expect, steps) {
  await client.query("begin");
  let outcome = "allowed";
  let detail = "";
  try {
    const { rows } = await client.query(
      `insert into public.items (user_id, sku, title, category, condition, cost_basis)
       values ($1, 'AUDIT-TMP', 'audit probe', 'tops', 'good', 1) returning id`,
      [seller]
    );
    await steps(rows[0].id);
  } catch (error) {
    outcome = "refused";
    detail = error.message.split("\n")[0].slice(0, 80);
  }
  await client.query("rollback");

  const ok = outcome === expect;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${description.padEnd(46)} ${outcome}${detail ? ` — ${detail}` : ""}`);
  if (!ok) violations.push(`${description}: expected ${expect}, got ${outcome}`);
}

const draft = (itemId, channel, status = "draft") =>
  client.query(
    `insert into public.listings (user_id, item_id, channel, price, status)
     values ($1, $2, $3, 50, $4)`,
    [seller, itemId, channel, status]
  );
const consign = (itemId) =>
  client.query(
    "update public.items set custody = 'consigned', consigned_to = 'therealreal' where id = $1",
    [itemId]
  );

await custodyCase("listing elsewhere while consigned", "refused", async (id) => {
  await consign(id);
  await draft(id, "depop");
});
await custodyCase("listing with the consignor holding it", "allowed", async (id) => {
  await consign(id);
  await draft(id, "therealreal");
});
await custodyCase("listing anywhere while in hand", "allowed", (id) => draft(id, "depop"));
await custodyCase("listing again once it came back", "allowed", async (id) => {
  await consign(id);
  await client.query(
    "update public.items set custody = 'returned', consigned_to = null where id = $1",
    [id]
  );
  await draft(id, "depop");
});
await custodyCase("consigning while still live elsewhere", "refused", async (id) => {
  await draft(id, "depop", "live");
  await consign(id);
});
await custodyCase("consigning with only a draft elsewhere", "allowed", async (id) => {
  // A draft was never published, so nobody can buy it. Blocking this would
  // make the normal path — draft everywhere, then decide — impossible.
  await draft(id, "depop");
  await consign(id);
});

console.log("\nEvery table has row-level security on");
const { rows: tables } = await client.query(`
  select c.relname, c.relrowsecurity,
    (select count(*) from pg_policies p where p.tablename = c.relname and p.schemaname = 'public') policies
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
  order by c.relname`);

for (const table of tables) {
  if (!table.relrowsecurity) {
    console.log(`  FAIL ${table.relname} — RLS is OFF`);
    violations.push(`${table.relname}: row-level security is not enabled`);
    continue;
  }
  // No policy with RLS on means deny-all, which is safe but usually a mistake.
  // schema_migrations is the deliberate case: only migrations touch it.
  if (Number(table.policies) === 0 && table.relname !== "schema_migrations") {
    console.log(`  ??   ${table.relname} — RLS on, no policy (deny-all)`);
    notes.push(`${table.relname} has RLS on and no policy; nothing can read it through PostgREST`);
  }
}
console.log(`  ok   ${tables.length} tables checked`);

await client.end();

if (notes.length > 0) {
  console.log("\nNotes:");
  for (const note of notes) console.log(`  · ${note}`);
}

if (violations.length > 0) {
  console.error(`\n${violations.length} violation(s):`);
  for (const v of violations) console.error(`  ✗ ${v}`);
  process.exit(1);
}

console.log("\nno violations — a seller can reach their own rows and nothing else");
