import { addItemByHand, analyzePhotos } from "@/app/actions";
import { idList, mjson, readJson, withMobileSession } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";

/**
 * Photos in, one unreviewed garment out, with listing copy drafted for every
 * channel — exactly what the web's Add page does when the seller presses
 * Identify.
 *
 * `mode: "manual"` skips the model: photos filed against a blank draft the
 * seller fills in by hand, for when there is no tag to read or no wish to
 * pay for the read. Identification itself is not plan-gated (BACKLOG.md:
 * never meter the AI); the plan cap bites later, at publish.
 *
 * Takes a while: two photos through the model is several seconds. The app
 * should show that, not time out at ten.
 */
export async function POST(request: Request) {
  return withMobileSession(request, async () => {
    const body = await readJson<{ photoIds?: unknown; mode?: unknown }>(request);
    const photoIds = idList(body?.photoIds, 12);
    if (!photoIds || photoIds.length === 0) {
      return mjson({ ok: false, error: "photoIds must be a list of one to twelve photo ids." }, 400);
    }

    const outcome =
      body?.mode === "manual" ? await addItemByHand(photoIds) : await analyzePhotos(photoIds);
    return mjson(outcome, outcome.ok ? 200 : 422);
  });
}
