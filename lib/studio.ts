/**
 * White studio background, in the browser, for free.
 *
 * Two facts drove this design. First: Claude's API is vision-in, text-out — it
 * can read a photo but cannot return an edited one, so "use the Claude key"
 * was never an option at any price. Second: the paid APIs (PhotoRoom,
 * remove.bg) charge per image and Vendoo meters exactly this feature — while
 * @imgly/background-removal runs a segmentation model in the browser via WASM.
 * Zero per-image cost, no meter to hit, and the photo never leaves the
 * seller's machine.
 *
 * The trade: the model weighs ~50MB, downloaded once on first use and cached
 * by the browser after that, and each photo takes a few seconds of local
 * compute. For a listing photo that's a fine price for free and private.
 *
 * The subject is kept, the background replaced with flat white — the studio
 * look every marketplace's best listings have. Output is JPEG because the
 * white composite has no transparency left to preserve, and marketplaces
 * recompress anyway.
 */
export async function studioBackground(file: File): Promise<File> {
  // Dynamic import: the model machinery is heavy and most sessions never use
  // it. Nobody pays the bundle cost for a toggle they left off.
  const { removeBackground } = await import("@imgly/background-removal");

  const cutout = await removeBackground(file, {
    output: { format: "image/png" }, // keep alpha for the composite
  });

  const bitmap = await createImageBitmap(cutout);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't get a canvas context.");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.92)
  );
  if (!blob) throw new Error("Couldn't encode the cleaned photo.");

  const name = file.name.replace(/\.\w+$/, "") + "-studio.jpg";
  return new File([blob], name, { type: "image/jpeg" });
}
