import { markListed, recordSale, saveListingUrl, unmarkListed } from "@/app/actions";
import { mjson, readJson, withMobileSession } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LINK = /^https?:\/\//i;

/**
 * The seller's word about a listing: it is live, it sold, it is back to
 * draft — or just the link to it.
 *
 * Every transition here is the one the web's channel board makes, with the
 * same gate. `live` is refused at the plan cap (roomForOneMore); `sold`
 * writes the sale and its fees from lib/fees.ts and opens a delist task for
 * every sibling still live; `draft` refuses a listing with a sale recorded
 * against it. A direct `listings.status` update from the app would skip all
 * three, and the plan cap is the one that costs money.
 *
 * This is the seller saying so. It is not the node saying so — a node's
 * report earns a fill job `filled` at most, never `live` (CLAUDE.md, Browser
 * nodes). The app must not call this on the strength of a fill job's status.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withMobileSession(request, async () => {
    const { id } = await params;
    if (!UUID.test(id)) return mjson({ ok: false, error: "Not a listing id." }, 400);

    const body = await readJson<{ status?: unknown; url?: unknown; sale?: unknown }>(request);
    const url = typeof body?.url === "string" ? body.url.trim() : "";
    if (url && !LINK.test(url)) {
      return mjson({ ok: false, error: "That doesn't look like a link — it should start with https://" }, 400);
    }

    switch (body?.status) {
      case "live": {
        const outcome = await markListed(id);
        if (!outcome.ok) return mjson(outcome, 422);
        if (url) {
          const linked = await saveListingUrl(id, url);
          if (!linked.ok) return mjson({ ok: true, status: "live", url: null, warning: linked.error });
        }
        return mjson({ ok: true, status: "live", url: url || null });
      }
      case "draft": {
        const outcome = await unmarkListed(id);
        return outcome.ok ? mjson({ ok: true, status: "draft" }) : mjson(outcome, 422);
      }
      case "sold": {
        const sale = body?.sale && typeof body.sale === "object" ? (body.sale as Record<string, unknown>) : null;
        const soldPrice = Number(sale?.soldPrice);
        if (!sale || !Number.isFinite(soldPrice) || soldPrice <= 0) {
          return mjson({ ok: false, error: "sale.soldPrice is required: what did it actually sell for?" }, 400);
        }
        const number = (key: string) => (typeof sale[key] === "number" ? (sale[key] as number) : undefined);
        const soldAt = typeof sale.soldAt === "string" && !Number.isNaN(Date.parse(sale.soldAt)) ? sale.soldAt : undefined;
        const outcome = await recordSale(id, {
          soldPrice,
          shippingCollected: number("shippingCollected"),
          shippingCost: number("shippingCost"),
          soldAt,
        });
        return outcome.ok ? mjson({ ok: true, status: "sold", toDelist: outcome.toDelist }) : mjson(outcome, 422);
      }
      case undefined: {
        if (!url) return mjson({ ok: false, error: "Send status (live, draft, sold) or url." }, 400);
        const outcome = await saveListingUrl(id, url);
        return outcome.ok ? mjson({ ok: true, url }) : mjson(outcome, 422);
      }
      default:
        return mjson({ ok: false, error: "status must be live, draft or sold." }, 400);
    }
  });
}
