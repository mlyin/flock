import { CHANNEL_LABEL, type Channel } from "@/lib/fees";

/**
 * The marketplace's own mark, 16px.
 *
 * "DP" and "VT" made the seller translate a code back into a marketplace every
 * time they scanned the grid. The real logo is recognised without reading,
 * which is the whole job of a chip in a dense table.
 *
 * The files live in public/channels rather than being hotlinked, so a fifty-row
 * grid makes no requests to nine marketplaces — and the icons keep working when
 * one of them moves a path or starts refusing referrers.
 *
 * Sourced per marketplace rather than from one favicon service: eBay's favicon
 * is its four-colour wordmark, which at 16px is a smear, while its PWA icon is
 * the same wordmark inside a white disc and stays recognisable. The RealReal is
 * the same story. Every file here was checked at chip size, not just fetched.
 */

export default function ChannelIcon({
  channel,
  size = 16,
  alt = false,
}: {
  channel: Channel;
  size?: number;
  alt?: boolean;
}) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element -- a static 64px icon;
       next/image would add a loader round trip for 1KB. */
    <img
      className="chan-icon"
      src={`/channels/${channel}.png`}
      width={size}
      height={size}
      alt={alt ? CHANNEL_LABEL[channel] : ""}
      aria-hidden={alt ? undefined : true}
      loading="lazy"
      decoding="async"
    />
  );
}
