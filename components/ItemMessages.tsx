import { CHANNEL_LABEL } from "@/lib/fees";
import { usd } from "@/lib/money";
import { getMessagesForItem, scoreOffer } from "@/lib/offers";

const ago = (iso: string) => {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
};

/**
 * Every message about this one garment, from every channel, oldest first.
 *
 * The whole conversation in one column regardless of which marketplace each
 * message came from — that's the thing you can't get by opening four apps.
 */
export default async function ItemMessages({ itemId }: { itemId: string }) {
  const messages = await getMessagesForItem(itemId);
  if (messages.length === 0) return null;

  const offers = messages
    .filter((m) => m.kind === "offer")
    .map(scoreOffer)
    .filter((o): o is NonNullable<typeof o> => o !== null);
  const best = [...offers].sort((a, b) => b.amount - a.amount)[0];
  const channels = [...new Set(messages.map((m) => m.channel))];

  return (
    <>
      <div className="sectionhead">
        <h2>Conversation</h2>
        <p>
          {messages.length} message{messages.length === 1 ? "" : "s"} across{" "}
          {channels.map((c) => CHANNEL_LABEL[c]).join(", ")}
          {best ? ` · best offer ${usd(best.amount)}` : ""}
        </p>
      </div>

      <div className="thread">
        {messages.map((message) => {
          const offer = message.kind === "offer" ? scoreOffer(message) : null;
          const outgoing = message.direction === "outgoing";

          return (
            <div
              key={message.id}
              className={`msg ${outgoing ? "msg-out" : ""} ${message.read_at ? "" : "msg-unread"}`}
            >
              <div className="msg-head">
                <span className="msg-sender">{outgoing ? "You" : message.sender ?? "Buyer"}</span>
                <span className="msg-channel">{CHANNEL_LABEL[message.channel]}</span>
                <span className="msg-time">{ago(message.received_at)}</span>
              </div>

              {offer && (
                <div className="msg-offer">
                  <strong>{usd(offer.amount)}</strong>
                  <span className="muted">nets {usd(offer.net)}</span>
                  {offer.aboveFloor !== null && (
                    <span className={offer.aboveFloor ? "num-pos" : "num-neg"}>
                      {offer.aboveFloor ? "clears your floor" : "under your floor"}
                    </span>
                  )}
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
    </>
  );
}
