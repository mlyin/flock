import Link from "next/link";
import SyncMessages from "@/components/SyncMessages";
import OfferQueue, { type OfferView } from "@/components/OfferQueue";
import { CHANNEL_LABEL } from "@/lib/fees";
import { usd } from "@/lib/money";
import { getMessages, getOpenOffers, groupByItem, scoreOffer } from "@/lib/offers";

export const dynamic = "force-dynamic";

const ago = (iso: string) => {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
};

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const view = sp.view === "messages" ? "messages" : "offers";

  const [offers, messages] = await Promise.all([getOpenOffers(), getMessages()]);

  // Serialise for the client component — Dates don't cross the boundary.
  const offerViews: OfferView[] = offers.map((o) => ({
    id: o.row.id,
    channel: o.channel,
    sender: o.row.sender,
    body: o.row.body,
    amount: o.amount,
    net: o.net,
    floor: o.floor,
    profit: o.profit,
    aboveFloor: o.aboveFloor,
    hoursLeft: o.hoursLeft,
    offerUrl: o.row.offer_url ?? null,
    receivedAt: o.row.received_at,
    item: o.item
      ? {
          id: o.item.id,
          sku: o.item.sku,
          title: o.item.title,
          brand: o.item.brand,
          listPrice: o.item.list_price == null ? null : Number(o.item.list_price),
        }
      : null,
  }));

  const groups = groupByItem(messages);
  const unread = messages.filter((m) => !m.read_at).length;

  return (
    <>
      <div className="pagehead">
        <h1>Inbox</h1>
        <p>
          Offers and buyer messages from every channel, in one place, grouped by garment.
          {unread > 0 && ` ${unread} unread.`}
        </p>
      </div>

      <div className="tabs">
        <Link href="/inbox" className={view === "offers" ? "tab tab-on" : "tab"}>
          Offers{offers.length > 0 && <b>{offers.length}</b>}
        </Link>
        <Link href="/inbox?view=messages" className={view === "messages" ? "tab tab-on" : "tab"}>
          All messages{unread > 0 && <b>{unread}</b>}
        </Link>
      </div>

      <SyncMessages />

      {view === "offers" ? (
        <OfferQueue offers={offerViews} />
      ) : messages.length === 0 ? (
        <div className="notice">
          <strong>No messages yet</strong>
          <p>
            Messages are read from your marketplace inboxes by the extension. Once it syncs a
            channel, offers and questions land here against the garment they&apos;re about.
          </p>
        </div>
      ) : (
        <div className="threads">
          {groups.map((group) => {
            const scored = group.rows
              .filter((r) => r.kind === "offer")
              .map(scoreOffer)
              .filter((o): o is NonNullable<typeof o> => o !== null);
            const best = scored.sort((a, b) => b.amount - a.amount)[0];
            const floor = best?.floor ?? null;

            return (
              <div key={group.key} className="thread">
                <div className="thread-head">
                  {group.item ? (
                    <Link href={`/items/${group.item.id}`} className="thread-item">
                      <strong>
                        {group.item.brand ? `${group.item.brand} ` : ""}
                        {group.item.title}
                      </strong>
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
                      {best && (
                        <span className={best.amount >= floor ? "num-pos" : "num-neg"}>
                          {" · "}best offer {usd(best.amount)}
                        </span>
                      )}
                    </span>
                  )}
                </div>

                {group.rows.map((message) => {
                  const offer = message.kind === "offer" ? scoreOffer(message) : null;
                  return (
                    <div key={message.id} className={message.read_at ? "msg" : "msg msg-unread"}>
                      <div className="msg-head">
                        <span className="msg-sender">
                          {message.direction === "outgoing" ? "You" : message.sender ?? "Buyer"}
                        </span>
                        <span className="msg-channel">{CHANNEL_LABEL[message.channel]}</span>
                        <span className="msg-time">{ago(message.received_at)}</span>
                      </div>

                      {offer && (
                        <div className="msg-offer">
                          <strong>{usd(offer.amount)}</strong>
                          <span className="muted">
                            nets {usd(offer.net)}
                            {offer.aboveFloor === null
                              ? ""
                              : offer.aboveFloor
                                ? " — above your floor"
                                : " — below your floor"}
                          </span>
                          {offer.status !== "open" && (
                            <span className="badge badge-draft">{offer.status}</span>
                          )}
                        </div>
                      )}

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
