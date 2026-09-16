import { deleteItem, saveItemFields } from "@/app/actions";
import { pickItemFields } from "@/lib/item-fields";
import { mjson, readJson, withMobileSession } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Edit a garment, or delete one — through the same rules as the web.
 *
 * PATCH is the review screen's save: send the fields that changed, blank to
 * clear. It marks the garment reviewed and pushes a new asking price onto
 * every draft and live listing (app/actions.ts saveItemFields). A direct
 * `items` update from the app would skip that push, and Flock's dashboard
 * would then show a price no marketplace form has.
 *
 * DELETE refuses a garment with a live listing — deleting here does not take
 * the listing down, so the seller has to end it first — and removes the
 * photos from Storage along with the row. A direct `items` delete would
 * leave both behind.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withMobileSession(request, async () => {
    const { id } = await params;
    if (!UUID.test(id)) return mjson({ ok: false, error: "Not a garment id." }, 400);

    const body = await readJson<Record<string, unknown>>(request);
    if (!body) return mjson({ ok: false, error: "Send a JSON object of fields." }, 400);

    const fields = pickItemFields(body);
    if (Object.keys(fields).length === 0) {
      return mjson({ ok: false, error: "None of those are garment fields." }, 400);
    }

    const outcome = await saveItemFields(id, fields);
    return mjson(outcome, outcome.ok ? 200 : 422);
  });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withMobileSession(request, async () => {
    const { id } = await params;
    if (!UUID.test(id)) return mjson({ ok: false, error: "Not a garment id." }, 400);

    const outcome = await deleteItem(id);
    return mjson(outcome, outcome.ok ? 200 : 422);
  });
}
