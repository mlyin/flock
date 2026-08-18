import Link from "next/link";
import InboxClient, { type InboxPhoto } from "@/components/InboxClient";
import Uploader from "@/components/Uploader";
import { getUnassignedPhotos, signPhotos } from "@/lib/data";
import { currentUser, supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const user = await currentUser();
  if (!user) return null; // middleware redirects; this is belt and braces

  const photos = await getUnassignedPhotos();
  const signed = await signPhotos(photos.map((p) => p.storage_path));

  const inbox: InboxPhoto[] = photos
    .filter((p) => signed[p.storage_path])
    .map((p) => ({ id: p.id, url: signed[p.storage_path], bytes: p.bytes }));

  const supabase = await supabaseServer();
  const { data: unreviewed } = await supabase
    .from("items")
    .select("id, sku, title, brand")
    .eq("review_state", "unreviewed")
    .order("created_at", { ascending: false });

  return (
    <>
      <div className="sectionhead">
        <h2>Inbox</h2>
        <p>Photos waiting to become garments</p>
      </div>

      <Uploader userId={user.id} />

      {(unreviewed?.length ?? 0) > 0 && (
        <div className="notice notice-warn">
          <strong>
            {unreviewed!.length} draft{unreviewed!.length === 1 ? "" : "s"} waiting on you
          </strong>
          <p>
            {unreviewed!.map((item, index) => (
              <span key={item.id}>
                {index > 0 && " · "}
                <Link href={`/items/${item.id}`} className="link">
                  {item.sku} {item.brand ?? item.title}
                </Link>
              </span>
            ))}
          </p>
        </div>
      )}

      {inbox.length === 0 ? (
        <div className="notice">
          <strong>Nothing waiting</strong>
          <p>
            Upload a garment and its brand tag, then pick both and hit Identify. The model
            reads them together and drafts the listing.
          </p>
        </div>
      ) : (
        <InboxClient photos={inbox} />
      )}
    </>
  );
}
