"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cleanPhotoBackgrounds, registerPhoto } from "@/app/actions";

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
  // Persisted: a seller who wants studio backgrounds wants them every session.
  const [studio, setStudio] = useState(
    () => typeof window !== "undefined" && localStorage.getItem("flock:studio") === "on"
  );
  const [stage, setStage] = useState<string | null>(null);
  const router = useRouter();

  async function upload(files: FileList) {
    const supabase = supabaseBrowser();
    const problems: string[] = [];
    const uploaded: string[] = [];

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

      // Upload the original first, always. Cleaning happens afterwards on the
      // server, so a service that's down or slow can never cost a photo.
      const outgoing = file;

      // The browser uploads straight to storage. The bucket policy checks that
      // the first path segment is the caller's own id, so this can't be aimed
      // at anyone else's prefix.
      const outExt = EXT[outgoing.type] ?? ext;
      const key = `${userId}/inbox/${crypto.randomUUID()}.${outExt}`;
      const { error } = await supabase.storage.from("photos").upload(key, outgoing, {
        contentType: outgoing.type,
        upsert: false,
      });

      if (error) {
        problems.push(`${file.name}: ${error.message}`);
      } else {
        const recorded = await registerPhoto(key, outgoing.size);
        if (!recorded.ok) problems.push(`${file.name}: ${recorded.error}`);
        else if (recorded.photoId) uploaded.push(recorded.photoId);
      }

      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }

    // One round trip for the whole batch, on the server, after everything is
    // safely stored.
    if (studio && uploaded.length > 0) {
      setStage(`Removing backgrounds — ${uploaded.length} photo${uploaded.length === 1 ? "" : "s"}…`);
      const outcome = await cleanPhotoBackgrounds(uploaded);
      if (!outcome.ok) problems.push(outcome.error);
      else if (outcome.failed > 0) {
        problems.push(
          `${outcome.failed} photo${outcome.failed === 1 ? "" : "s"} kept the original background — the service couldn't process ${outcome.failed === 1 ? "it" : "them"}.`
        );
      }
      setStage(null);
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
          {/* Was "two per garment works best", which was advice about what the
              model needs rather than what a listing needs. Buyers scroll past a
              two-photo listing, and the same shots go up on every channel — so
              the guidance is the set a marketplace expects, and the model reads
              whichever of them happen to be useful. */}
          <p>
            As many as you like — front, back, the brand and size tag, and a close-up of any
            flaw. More angles sell better on every channel.
          </p>
          <p className="muted">
            Fill the frame with the tag when you shoot it. That&apos;s the photo the size and
            brand are read from, and a legible one is the difference between a listing that
            fills itself and one you finish by hand.
          </p>
        </div>
        <label className="studio-toggle">
          <input
            type="checkbox"
            checked={studio}
            onChange={(e) => {
              setStudio(e.target.checked);
              localStorage.setItem("flock:studio", e.target.checked ? "on" : "off");
            }}
            disabled={busy}
          />
          <span>
            White background
            <em>Runs on Flock&apos;s server after upload. Originals are kept until it succeeds.</em>
          </span>
        </label>
        <button
          type="button"
          className="button"
          onClick={() => input.current?.click()}
          disabled={busy}
        >
          {busy ? (stage ?? `Uploading ${progress.done}/${progress.total}…`) : "Choose photos"}
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
