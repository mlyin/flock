import Link from "next/link";
import type { ChannelHealth } from "@/lib/heartbeat";
import ChannelIcon from "./ChannelIcon";

/**
 * Says when the always-on node stopped reporting.
 *
 * The only thing on the dashboard whose job is to be noticed by its absence
 * elsewhere. Every failure of an unattended browser — an expired marketplace
 * session, a screen saver occluding Chrome, a macOS update that rebooted the
 * box, a revoked pairing token — presents as silence, and silence looks
 * exactly like a quiet week.
 *
 * Renders nothing while everything is fine. A panel that is always on screen
 * saying "all good" is one nobody reads on the day it says otherwise.
 */
export default function SyncHealth({ health }: { health: ChannelHealth[] }) {
  const wrong = health.filter((h) => h.state === "silent" || h.state === "erroring");
  if (wrong.length === 0) return null;

  return (
    <div className="delist delist-quiet">
      <div className="delist-head">
        <strong>
          {wrong.length === 1
            ? `${wrong[0].label} has stopped syncing`
            : `${wrong.length} channels have stopped syncing`}
        </strong>
        <p>
          Offers, messages and sale detection all ride on these reads. While one is quiet,
          nothing from that marketplace reaches Flock — and it looks the same as a quiet week.
        </p>
      </div>

      <ul className="delist-list">
        {wrong.map((h) => (
          <li key={h.channel}>
            <ChannelIcon channel={h.channel} />
            <div className="delist-what">
              <strong>{h.label}</strong>
              <span className="muted">{h.detail}</span>
            </div>
            <Link href="/connect" className="pill">
              Check it
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
