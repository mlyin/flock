// Relative, not "@/": the test runner resolves tsconfig paths differently from
// Next, and this file has to load under both.
import manifest from "../extension/manifest.json";

/**
 * The extension version this build of the app expects.
 *
 * Read from the extension's own manifest rather than duplicated, so bumping
 * the manifest is the only step — a second copy would drift and then lie.
 */
export const EXTENSION_VERSION: string = manifest.version;

/**
 * True when `installed` is older than `current`.
 *
 * Semver-ish: compares numeric segments left to right, missing segments count
 * as zero. Anything unparseable is treated as not-stale — a version we can't
 * read is not evidence of anything, and nagging someone whose install is
 * actually fine trains them to ignore the notice that matters.
 */
export function isStale(installed: string | null, current: string = EXTENSION_VERSION) {
  if (!installed) return false;

  const parse = (v: string) => v.split(".").map((p) => Number.parseInt(p, 10));
  const a = parse(installed);
  const b = parse(current);
  if (a.some(Number.isNaN) || b.some(Number.isNaN)) return false;

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}
