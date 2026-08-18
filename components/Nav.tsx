"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Inventory" },
  { href: "/inbox", label: "Add" },
  { href: "/fees", label: "Fees" },
  { href: "/connect", label: "Extension" },
  { href: "/settings", label: "Settings" },
];

export default function Nav({ email }: { email?: string | null }) {
  const pathname = usePathname();

  return (
    <header className="topbar">
      <Link href="/" className="brandmark">
        <strong>Threader</strong>
        <span>Stage 01 · photo intake</span>
      </Link>

      <div className="navright">
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

        {email && (
          <form action="/auth/signout" method="post" className="navuser">
            <span title={email}>{email}</span>
            <button type="submit" className="navlink">
              Sign out
            </button>
          </form>
        )}
      </div>
    </header>
  );
}
