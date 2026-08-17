import Link from "next/link";
import { notFound } from "next/navigation";
import PostFlow from "@/components/PostFlow";
import { CHANNEL_LABEL, projectedNet, type Channel } from "@/lib/fees";
import { supabaseServer } from "@/lib/supabase/server";
import { signPhotos } from "@/lib/data";

export const dynamic = "force-dynamic";

/**
 * The mobile listing screen.
 *
 * iOS sandboxes apps, so nothing can fill Depop's form for you there. What it
 * can do is remove the typing: each field gets one tap to copy, in the order
 * the marketplace asks for them. The photos are already in the camera roll —
 * Depop's own picker handles those better than we could.
 */
export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();

  const { data: listing } = await supabase
    .from("listings")
    .select("id, channel, title, description, price, status, draft, item_id")
    .eq("id", id)
    .maybeSingle();

  if (!listing) notFound();

  const { data: item } = await supabase
    .from("items")
    .select("sku, brand, size, condition")
    .eq("id", listing.item_id)
    .single();

  const { data: photos } = await supabase
    .from("photos")
    .select("storage_path")
    .eq("item_id", listing.item_id)
    .order("sort_order");

  const signed = await signPhotos((photos ?? []).map((p) => p.storage_path));
  const draft = (listing.draft ?? {}) as { tags?: string[] };
  const channel = listing.channel as Channel;

  return (
    <>
      <div className="sectionhead">
        <h2>
          <Link href={`/items/${listing.item_id}`}>← {item?.sku ?? "Item"}</Link>
        </h2>
        <p>
          {CHANNEL_LABEL[channel]} · nets {formatUsd(projectedNet(channel, Number(listing.price)))}
        </p>
      </div>

      <PostFlow
        listingId={listing.id}
        channel={channel}
        alreadyLive={listing.status === "live"}
        photos={Object.values(signed)}
        fields={[
          { key: "title", label: "Title", value: listing.title ?? "" },
          { key: "price", label: "Price", value: String(listing.price) },
          { key: "description", label: "Description", value: listing.description ?? "", long: true },
          ...(draft.tags?.length
            ? [{ key: "tags", label: "Tags", value: draft.tags.join(" ") }]
            : []),
        ]}
        reminders={[
          item?.brand ? `Brand: ${item.brand}` : null,
          item?.size ? `Size: ${item.size}` : null,
          item?.condition ? `Condition: ${item.condition}` : null,
        ].filter(Boolean) as string[]}
      />
    </>
  );
}

const formatUsd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });
