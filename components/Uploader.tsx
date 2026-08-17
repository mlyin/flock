"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { registerPhoto } from "@/app/actions";

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

export default function Uploader({ userId }: { userId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [errors, setErrors] = useState<string[]>([]);
  const router = useRouter();

  async function upload(files: FileList) {
    const supabase = supabaseBrowser();
    const problems: string[] = [];

    setBusy(true);
    setErrors([]);
    setProgress({ done: 0, total: files.length });

    for (const file of Array.from(files)) {
      const ext = EXT[file.type];
      if (!ext) {
        problems.push(
          file.name.toLowerCase().endsWith(".heic")
            ? `${file.name} is HEIC — set your camera to "Most Compatible" to shoot JPEG.`
            : `${file.name} isn't a supported image type.`
        );
        setProgress((p) => ({ ...p, done: p.done + 1 }));
        continue;
      }

      // The browser uploads straight to storage. The bucket policy checks that
      // the first path segment is the caller's own id, so this can't be aimed
      // at anyone else's prefix.
      const key = `${userId}/inbox/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("photos").upload(key, file, {
        contentType: file.type,
        upsert: false,
      });

      if (error) {
        problems.push(`${file.name}: ${error.message}`);
      } else {
        const recorded = await registerPhoto(key, file.size);
        if (!recorded.ok) problems.push(`${file.name}: ${recorded.error}`);
      }

      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }

    setErrors(problems);
    setBusy(false);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  return (
    <>
      <div className="uploader">
        <div>
          <strong>Add photos</strong>
          <p>
            Two per garment works best — the piece, and its brand or care tag. On a phone this
            opens the camera.
          </p>
        </div>
        <button
          type="button"
          className="button"
          onClick={() => input.current?.click()}
          disabled={busy}
        >
          {busy ? `Uploading ${progress.done}/${progress.total}…` : "Choose photos"}
        </button>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          multiple
          hidden
          onChange={(event) => event.target.files?.length && upload(event.target.files)}
        />
      </div>

      {errors.length > 0 && (
        <div className="notice notice-bad">
          <strong>
            {errors.length} photo{errors.length === 1 ? "" : "s"} didn&apos;t upload
          </strong>
          {errors.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      )}
    </>
  );
}
