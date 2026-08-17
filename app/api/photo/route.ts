import fs from "node:fs";
import path from "node:path";
import { resolvePhoto } from "@/lib/intake";

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".heic": "image/heic",
};

/** Serves files out of photos/ — the only path that reads user photos off disk. */
export async function GET(request: Request) {
  const relative = new URL(request.url).searchParams.get("p");
  if (!relative) return new Response("Missing p", { status: 400 });

  const full = resolvePhoto(relative);
  if (!full) return new Response("Forbidden", { status: 403 });
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(fs.readFileSync(full), {
    headers: {
      "Content-Type": TYPES[path.extname(full).toLowerCase()] ?? "application/octet-stream",
      "Cache-Control": "private, max-age=300",
    },
  });
}
