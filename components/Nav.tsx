"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Four destinations, one per job the seller actually has: look at stock, add
 * stock, answer buyers, configure. Fees and the extension pairing used to sit
 * here too — they're reference and one-time setup, so they live in Settings now.
 */
const LINKS = [
  { href: "/", label: "Inventory" },
  { href: "/add", label: "Add" },
  { href: "/inbox", label: "Inbox" },
  { href: "/pricing", label: "Pricing" },
  { href: "/settings", label: "Settings" },
];

/**
 * Where a "Pricing" link would go, the plan sits instead.
 *
 * A bare Pricing link is only useful once, and useless to everyone already
 * paying. The chip answers the question a seller actually has — how much room
 * is left — and doubles as the way to the page when the answer is "not much".
 *
 * A beta seller sees the badge and no upgrade path at all. They were given the
 * top tier; nagging them toward a checkout they should never reach would be
 * the one thing that makes the badge feel like a trial.
 */
export default function Nav({
  email,
  todo,
  plan,
}: {
  email?: string | null;
  todo?: number;
  plan?: { label: string; beta: boolean; active: number; remaining: number | null } | null;
}) {
  const pathname = usePathname();

  return (
    <header className="topbar">
      <Link href="/" className="brandmark">
        {/* The mark ships as SVG rather than the generated PNG so it stays
            sharp at any zoom. alt="" because the wordmark beside it already
            names the product — announcing it twice is noise in a screen
            reader. */}
        <img src="/brand/icon-lime.svg" alt="" width={28} height={28} />
        <strong>Flock</strong>
      </Link>

      <nav className="navlinks" aria-label="Primary">
        {LINKS.map((link) => {
          const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={active ? "navlink navlink-on" : "navlink"}
              aria-current={active ? "page" : undefined}
            >
              {link.label}
              {link.href === "/inbox" && todo ? <i className="navdot" aria-hidden /> : null}
            </Link>
          );
        })}
      </nav>

      <div className="navright">
        {plan &&
          (plan.beta ? (
            <span className="planchip planchip-beta" title="On Mutton permanently">
              Founding flock
            </span>
          ) : (
            <Link
              href="/pricing"
              className={`planchip ${plan.remaining === 0 ? "planchip-full" : ""}`}
              title={
                plan.remaining === null
                  ? `${plan.label} — no cap`
                  : `${plan.active} of ${plan.active + plan.remaining} listings live`
              }
            >
              {plan.label}
              {plan.remaining !== null && (
                <b>
                  {plan.active}/{plan.active + plan.remaining}
                </b>
              )}
            </Link>
          ))}
        <Link href="/add" className="button button-sm navcta">
          Add item
        </Link>
        {email && (
          <form action="/auth/signout" method="post" className="navuser">
            <span title={email}>{email}</span>
            <button type="submit" className="navlink">Sign out</button>
          </form>
        )}
      </div>
    </header>
  );
}
