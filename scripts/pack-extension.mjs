/**
 * Builds the store zip.
 *
 *   npm run pack:ext
 *
 * Differs from the source tree in one way: the localhost host permission is
 * stripped. It's there so you can point the extension at a dev server, but
 * reviewers treat unnecessary permissions as a reason to ask questions, and
 * end users have no dev server to reach.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "extension");
const BUILD = path.join(ROOT, "dist", "extension");
const manifest = JSON.parse(fs.readFileSync(path.join(SRC, "manifest.json"), "utf8"));
const ZIP = path.join(ROOT, "dist", `threader-extension-${manifest.version}.zip`);

fs.rmSync(path.join(ROOT, "dist"), { recursive: true, force: true });
fs.mkdirSync(BUILD, { recursive: true });

// README is for us, not for Chrome.
fs.cpSync(SRC, BUILD, {
  recursive: true,
  filter: (src) => path.basename(src) !== "README.md",
});

const stripped = manifest.host_permissions.filter((p) => !p.includes("localhost"));
fs.writeFileSync(
  path.join(BUILD, "manifest.json"),
  JSON.stringify({ ...manifest, host_permissions: stripped }, null, 2) + "\n"
);

if (process.platform === "win32") {
  execFileSync("powershell", [
    "-NoProfile",
    "-Command",
    `Compress-Archive -Path '${BUILD}\\*' -DestinationPath '${ZIP}' -Force`,
  ]);
} else {
  execFileSync("zip", ["-r", "-q", ZIP, "."], { cwd: BUILD });
}

const kb = Math.round(fs.statSync(ZIP).size / 1024);
console.log(`packed  ${path.relative(ROOT, ZIP)}  (${kb} KB)`);
console.log(`version ${manifest.version}`);
console.log(`hosts   ${stripped.join(", ")}`);
console.log(`\nUpload at https://chrome.google.com/webstore/devconsole`);
