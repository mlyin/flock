import Link from "next/link";
import SyncMessages from "@/components/SyncMessages";
import { CHANNEL_LABEL, projectedNet, type Channel } from "@/lib/fees";
import { usd } from "@/lib/money";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  channel: Channel;
  sender: string | null;
  body: string | null;
  kind: string;
  offer_amount: number | string | null;
  received_at: string;
  read_at: string | null;
  item_id: string | null;
  items: { id: string; sku: string; title: string; brand: string | null; floor_price: number | string | null } | null;
};

const ago = (iso: string) => {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
};

export default async function InboxPage() {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("messages")
    .select("*, items (id, sku, title, brand, floor_price)")
    .order("received_at", { ascending: false })
    .limit(200);

  const rows = (data ?? []) as unknown as Row[];

  // Grouped by garment, because the question is almost always "what's happening
  // with this item" rather than "what came in at 3pm".
  const groups = new Map<string, { item: Row["items"]; messages: Row[] }>();
  for (const row of rows) {
    const key = row.item_id ?? "unmatched";
    if (!groups.has(key)) groups.set(key, { item: row.items, messages: [] });
    groups.get(key)!.messages.push(row);
  }

  return (
    <>
      <div className="sectionhead">
        <h2>Inbox</h2>
        <p>Buyer messages and offers, every channel, grouped by garment</p>
      </div>

      <SyncMessages />

      {rows.length === 0 ? (
        <div className="notice">
          <strong>No messages yet</strong>
          <p>
            Messages are read from your marketplace inboxes by the extension. Once it syncs a
            channel, offers and questions land here against the garment they&apos;re about.
          </p>
        </div>
      ) : (
        <div className="threads">
          {[...groups.entries()].map(([key, group]) => {
            const floor = group.item?.floor_price == null ? null : Number(group.item.floor_price);
            const best = group.messages
              .filter((m) => m.offer_amount != null)
              .map((m) => Number(m.offer_amount))
              .sort((a, b) => b - a)[0];

            return (
              <div key={key} className="thread">
                <div className="thread-head">
                  {group.item ? (
                    <Link href={`/items/${group.item.id}`} className="thread-item">
                      <strong>{group.item.brand ? `${group.item.brand} ` : ""}{group.item.title}</strong>
                      <span className="muted">{group.item.sku}</span>
                    </Link>
                  ) : (
                    <span className="thread-item">
                      <strong>Not matched to an item</strong>
                      <span className="muted">no listing link in the message</span>
                    </span>
                  )}

                  {floor !== null && (
                    <span className="thread-floor">
                      floor {usd(floor)}
                      {best !== undefined && (
                        <span className={best >= floor ? "num-pos" : "num-neg"}>
                          {" · "}best offer {usd(best)}
                        </span>
                      )}
                    </span>
                  )}
                </div>

                {group.messages.map((message) => {
                  const amount = message.offer_amount == null ? null : Number(message.offer_amount);
                  const net = amount === null ? null : projectedNet(message.channel, amount);
                  const belowFloor = amount !== null && floor !== null && amount < floor;

                  return (
                    <div key={message.id} className={message.read_at ? "msg" : "msg msg-unread"}>
                      <div className="msg-head">
                        <span className="msg-sender">{message.sender ?? "Buyer"}</span>
                        <span className="msg-channel">{CHANNEL_LABEL[message.channel]}</span>
                        <span className="msg-time">{ago(message.received_at)}</span>
                      </div>

                      {amount !== null ? (
                        <div className="msg-offer">
                          <strong>{usd(amount)}</strong>
                          <span className="muted">
                            nets {usd(net!)}
                            {belowFloor ? " — below your floor" : floor !== null ? " — above your floor" : ""}
                          </span>
                        </div>
                      ) : null}

                      {message.body && <p className="msg-body">{message.body}</p>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
