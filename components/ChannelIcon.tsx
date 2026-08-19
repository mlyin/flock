import { CHANNEL_LABEL, type Channel } from "@/lib/fees";

/**
 * The marketplace's own mark, 16px.
 *
 * "DP" and "VT" made the seller translate a code back into a marketplace every
 * time they scanned the grid. The real logo is recognised instantly and
 * without reading, which is the entire job of a chip in a dense table.
 *
 * The files are stored under public/channels rather than hotlinked, so a grid
 * of fifty rows makes no requests to nine marketplaces — and so the icons keep
 * working when one of them changes a path or blocks referrers.
 *
 * Decorative by default: every caller already carries the channel name in the
 * chip's title or an adjacent label, so an alt here would be read twice.
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
