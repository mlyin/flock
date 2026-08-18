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
  { href: "/settings", label: "Settings" },
];

export default function Nav({ email, todo }: { email?: string | null; todo?: number }) {
  const pathname = usePathname();

  return (
    <header className="topbar">
      <Link href="/" className="brandmark">
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
