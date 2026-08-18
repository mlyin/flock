/**
 * Packs the extension and uploads the zip to Supabase Storage, where the
 * /install page links to it.
 *
 *   node scripts/publish-extension.mjs
 *
 * Two objects land in a public "extension" bucket:
 *
 *   flock-extension-<version>.zip   immutable, one per release
 *   flock-extension-latest.zip      overwritten every publish — the URL
 *                                      /install hands out, so old links keep
 *                                      working after a version bump
 *
 * The bucket is public on purpose: the zip is the same code any user could
 * read out of their own browser after installing, and a signed URL would
 * expire in someone's group chat. This whole flow is the stopgap until the
 * Chrome Web Store listing is approved; after that /install just links to the
 * store page and this script retires.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set (see .env.local).");
  process.exit(1);
}

// Always pack fresh — publishing a stale zip is worse than a slow publish.
execFileSync(process.execPath, [path.join(HERE, "pack-extension.mjs")], { stdio: "inherit" });

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "extension", "manifest.json"), "utf8"));
const zipPath = path.join(ROOT, "dist", `flock-extension-${manifest.version}.zip`);
const zip = fs.readFileSync(zipPath);

const supabase = createClient(url, secret);

// createBucket errors if it already exists; that's the steady state, not a failure.
const { error: bucketError } = await supabase.storage.createBucket("extension", { public: true });
if (bucketError && !/already exists/i.test(bucketError.message)) {
  console.error(`creating bucket: ${bucketError.message}`);
  process.exit(1);
}

for (const name of [`flock-extension-${manifest.version}.zip`, "flock-extension-latest.zip"]) {
  const { error } = await supabase.storage
    .from("extension")
    .upload(name, zip, { contentType: "application/zip", upsert: true });
  if (error) {
    console.error(`uploading ${name}: ${error.message}`);
    process.exit(1);
  }
  console.log(`uploaded ${name}  (${Math.round(zip.length / 1024)} KB)`);
}

const { data } = supabase.storage.from("extension").getPublicUrl("flock-extension-latest.zip");
console.log(`\npublic URL  ${data.publicUrl}`);
console.log("install page  https://www.sellonflock.com/install");
