"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Inventory" },
  { href: "/inbox", label: "Inbox" },
  { href: "/fees", label: "Fees" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <header className="topbar">
      <Link href="/" className="brandmark">
        <strong>Threader</strong>
        <span>Stage 01 · photo intake</span>
      </Link>
      <nav className="navlinks">
        {LINKS.map((link) => {
          const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
          return (
            <Link key={link.href} href={link.href} className={active ? "navlink navlink-on" : "navlink"}>
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
