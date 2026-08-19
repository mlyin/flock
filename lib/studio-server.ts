import sharp from "sharp";

/**
 * White studio backgrounds, done on a server you run.
 *
 * The browser version costs nothing and keeps photos local, but it spends the
 * seller's own CPU and makes them wait — on a phone, or on a batch of eleven
 * shoe photos, that's the wrong trade. This path sends the work to a
 * background-removal service instead.
 *
 * The service is `rembg` (github.com/danielgatis/rembg), which ships an HTTP
 * server wrapping the open segmentation models. It runs anywhere Docker does;
 * a small CPU VPS handles thousands of images a day. See
 * docs/BACKGROUND-REMOVAL.md for the deploy and the licensing note — the model
 * choice matters, because the best-known one is non-commercial.
 *
 * BG_REMOVAL_URL is SERVER-ONLY, deliberately. Exposing it to the browser
 * would publish an unauthenticated image-processing endpoint that anyone could
 * point their own traffic at.
 */
export const studioConfigured = () => Boolean(process.env.BG_REMOVAL_URL);

/** ISNet: markedly better edges than u2net, and Apache-2.0 rather than the non-commercial one. */
const MODEL = process.env.BG_REMOVAL_MODEL ?? "isnet-general-use";

export async function studioBackgroundServer(input: Buffer, filename: string): Promise<Buffer> {
  const base = process.env.BG_REMOVAL_URL;
  if (!base) throw new Error("BG_REMOVAL_URL isn't set.");

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(input)]), filename);

  // A stuck removal must not hold a listing hostage — the caller falls back to
  // the original photo on any failure, including this timeout.
  const response = await fetch(
    `${base.replace(/\/$/, "")}/api/remove?model=${encodeURIComponent(MODEL)}`,
    { method: "POST", body: form, signal: AbortSignal.timeout(45_000) }
  );

  if (!response.ok) {
    throw new Error(`Background service returned ${response.status}.`);
  }

  const cutout = Buffer.from(await response.arrayBuffer());

  // The service returns a PNG with alpha. Flatten onto white rather than
  // leaving transparency: marketplaces recompress to JPEG anyway, and an
  // un-flattened alpha becomes black on several of them.
  return sharp(cutout).flatten({ background: "#ffffff" }).jpeg({ quality: 92 }).toBuffer();
}
