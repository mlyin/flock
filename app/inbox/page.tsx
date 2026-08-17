import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import InboxClient, { type Shot } from "@/components/InboxClient";
import { INBOX } from "@/lib/intake";
import { all } from "@/lib/db";

export const dynamic = "force-dynamic";

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".heic", ".webp", ".avif"]);

function readInbox(): Shot[] {
  if (!fs.existsSync(INBOX)) return [];
  return fs
    .readdirSync(INBOX)
    .filter((name) => IMAGE_EXT.has(path.extname(name).toLowerCase()))
    .map((name) => {
      const stat = fs.statSync(path.join(INBOX, name));
      return { name, size: stat.size, modified: stat.mtimeMs };
    })
    .sort((a, b) => a.modified - b.modified);
}

type Pending = { id: number; sku: string; title: string; brand: string | null; swatch: string | null };

export default async function InboxPage() {
  const shots = readInbox();
  const unreviewed = all<Pending>(
    `SELECT id, sku, title, brand, swatch FROM items WHERE review_state = 'unreviewed' ORDER BY id DESC`
  );

  return (
    <>
      <div className="sectionhead">
        <h2>Inbox</h2>
        <p>photos/inbox</p>
      </div>

      {unreviewed.length > 0 && (
        <div className="notice notice-warn">
          <strong>
            {unreviewed.length} draft{unreviewed.length === 1 ? "" : "s"} waiting on you
          </strong>
          <p>
            {unreviewed.map((item, index) => (
              <span key={item.id}>
                {index > 0 && " · "}
                <Link href={`/items/${item.id}`} className="link">
                  {item.sku} {item.brand ?? item.title}
                </Link>
              </span>
            ))}
          </p>
        </div>
      )}

      {shots.length === 0 ? (
        <div className="notice">
          <strong>Inbox is empty</strong>
          <p>
            Drop photos into <code>photos/inbox</code> and reload. Shoot two per garment — the piece
            itself, and its brand or care tag. JPEG or PNG; iPhone HEIC needs converting first.
          </p>
        </div>
      ) : (
        <InboxClient shots={shots} />
      )}
    </>
  );
}
