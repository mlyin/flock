import { CHANNELS, CHANNEL_ABBR, CHANNEL_LABEL, type Channel } from "@/lib/fees";
import type { Listing } from "@/lib/queries";

/**
 * Five slots, always in the same order, so a column of these reads as a grid.
 * Colour carries state (live / sold / ended); the two-letter code carries channel.
 */
export default function ChannelMatrix({ listings }: { listings: Listing[] }) {
  const byChannel = new Map<Channel, Listing>();
  for (const l of listings) byChannel.set(l.channel, l);

  return (
    <div className="matrix">
      {CHANNELS.map((channel) => {
        const listing = byChannel.get(channel);
        const state = listing?.status ?? "off";
        const title = listing
          ? `${CHANNEL_LABEL[channel]} — ${listing.status}${listing.price ? ` at $${listing.price}` : ""}`
          : `${CHANNEL_LABEL[channel]} — not listed`;

        return (
          <span key={channel} className={`mchip mchip-${state}`} title={title}>
            {CHANNEL_ABBR[channel]}
          </span>
        );
      })}
    </div>
  );
}
