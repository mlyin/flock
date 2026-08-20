import { getItems } from "@/lib/data";
import { CHANNEL_LABEL } from "@/lib/fees";
import { currentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * The bookkeeping export: one CSV row per listing (bare row for an unlisted
 * garment), with the money columns FEE-ADJUSTED — sold rows carry the real
 * fees, net, and profit from the ledger, not the sticker price. Competitors'
 * exports stop at the sticker; a seller doing taxes needs the net.
 *
 * Session-auth via getItems(), which reads under RLS — no explicit scoping
 * needed and none possible to forget.
 */

/** RFC 4180: quote when needed, double internal quotes. Excel-safe. */
function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  // A leading =,+,-,@ would execute as a formula in Excel — the classic CSV
  // injection. A tab prefix neutralises it and is invisible in every viewer.
  const guarded = /^[=+\-@]/.test(s) ? `\t${s}` : s;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

const HEADER = [
  "sku", "title", "brand", "category", "size", "condition", "status",
  "cost_basis", "acquired", "source",
  "channel", "listing_status", "ask", "listing_url", "posted",
  "sold_date", "sold_price", "shipping_collected", "shipping_cost",
  "fees_total", "net_proceeds", "profit",
];

export async function GET() {
  const user = await currentUser();
  if (!user) return new Response("Sign in first.", { status: 401 });

  const items = await getItems();
  const rows: string[] = [HEADER.join(",")];

  for (const item of items) {
    const base = [
      item.sku, item.title, item.brand, item.category, item.size, item.condition,
      item.review_state === "unreviewed" ? "unreviewed" : item.status,
      item.cost_basis.toFixed(2), item.acquired_at, item.source,
    ];

    if (item.listings.length === 0) {
      rows.push([...base, "", "", "", "", "", "", "", "", "", "", "", ""].map(cell).join(","));
      continue;
    }

    for (const listing of item.listings) {
      const soldHere = item.sale && item.sale.channel === listing.channel;
      rows.push(
        [
          ...base,
          CHANNEL_LABEL[listing.channel], listing.status,
          listing.price.toFixed(2), listing.url, listing.posted_at?.slice(0, 10),
          soldHere ? item.sale!.sold_at.slice(0, 10) : "",
          soldHere ? item.sale!.sold_price.toFixed(2) : "",
          soldHere ? item.sale!.shipping_collected.toFixed(2) : "",
          soldHere ? item.sale!.shipping_cost.toFixed(2) : "",
          soldHere ? item.sale!.feeTotal.toFixed(2) : "",
          soldHere ? item.sale!.net.toFixed(2) : "",
          soldHere ? item.sale!.profit.toFixed(2) : "",
        ].map(cell).join(",")
      );
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  // BOM so Excel opens UTF-8 (Stüssy, Arc'teryx) without mangling it.
  return new Response("﻿" + rows.join("\r\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="flock-export-${today}.csv"`,
      "cache-control": "no-store",
    },
  });
}
