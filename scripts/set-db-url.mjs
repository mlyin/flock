/**
 * Writes SUPABASE_DB_URL into .env.local without the password ever appearing on
 * screen, in shell history, or in a process list.
 *
 *   node scripts/set-db-url.mjs [project-ref]
 *
 * Exists because the string Supabase hands you is a *template*: the
 * [YOUR-PASSWORD] placeholder has to be substituted, and saving it verbatim
 * fails silently — pg tries to resolve the bracketed text as a hostname and
 * reports ENOTFOUND, which looks nothing like "you forgot the password".
 *
 * It also percent-encodes the password, because one containing @ : / or ?
 * turns a valid URL into a baffling parse error otherwise.
 */

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV = path.join(ROOT, ".env.local");

// Session pooler, not "Direct connection" — direct is IPv6-only and times out
// on an ordinary IPv4 network.
const PROJECT_REF = process.argv[2] ?? "kcudagjttmnklnveitgh";
const HOST = "aws-0-us-west-2.pooler.supabase.com";

function askHidden(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    // Mute the echo so the password never renders to the terminal.
    let muted = false;
    const write = rl.output.write.bind(rl.output);
    rl.output.write = (chunk, ...rest) => (muted ? true : write(chunk, ...rest));

    rl.question(prompt, (answer) => {
      rl.output.write = write;
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });

    muted = true;
  });
}

const password = (await askHidden("Supabase database password: ")).trim();

if (!password) {
  console.error("Nothing entered - no change made.");
  process.exit(1);
}

if (/^\[.*\]$/.test(password)) {
  console.error(
    "That's the placeholder, not the password.\n" +
      "Supabase - Settings - Database - Reset password."
  );
  process.exit(1);
}

const url =
  "postgresql://postgres." +
  PROJECT_REF +
  ":" +
  encodeURIComponent(password) +
  "@" +
  HOST +
  ":5432/postgres";

let contents = fs.existsSync(ENV) ? fs.readFileSync(ENV, "utf8") : "";

contents = /^SUPABASE_DB_URL=/m.test(contents)
  ? contents.replace(/^SUPABASE_DB_URL=.*$/m, 'SUPABASE_DB_URL="' + url + '"')
  : contents.replace(/\n*$/, "\n") + 'SUPABASE_DB_URL="' + url + '"\n';

fs.writeFileSync(ENV, contents, { mode: 0o600 });

console.log("Wrote SUPABASE_DB_URL to .env.local");
console.log("  project " + PROJECT_REF + ", host " + HOST);
console.log("Next: node scripts/migrate.mjs --dry");
