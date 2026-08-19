import Link from "next/link";
import Landing from "@/components/Landing";
import { currentUser, supabaseConfigured } from "@/lib/supabase/server";
import ChannelActions from "@/components/ChannelActions";
import Filters from "@/components/Filters";
import ChannelViewToggle from "@/components/ChannelViewToggle";
import { CHANNEL_LABEL } from "@/lib/fees";
import ChannelIcon from "@/components/ChannelIcon";
import { usd, usdShort, pct } from "@/lib/money";
import { bestProjection, getItems, openDelistTasks, shelfAge, signPhotos, summarize } from "@/lib/data";
import DelistQueue from "@/components/DelistQueue";
import BulkController from "@/components/BulkController";

export const dynamic = "force-dynamic";

const AGING_DAYS = 45;

export default async function Inventory({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Signed out, this is the landing page. The local SQLite mode has no auth
  // at all, so it keeps going straight to the inventory.
  if (supabaseConfigured() && !(await currentUser())) return <Landing />;

  const sp = await searchParams;
  const params = {
    status: typeof sp.status === "string" ? sp.status : "all",
    channel: typeof sp.channel === "string" ? sp.channel : "all",
    sort: typeof sp.sort === "string" ? sp.sort : "sku",
  };

  const all = await getItems();
  const summary = summarize(all);
  const items = await getItems(params);

  // One signing call for the whole page rather than one per row.
  const heroes = new Map(
    all.map((i) => [i.id, i.photos.find((p) => p.role === "hero") ?? i.photos[0]])
  );
  const signed = await signPhotos(
    [...heroes.values()].filter(Boolean).map((p) => p!.storage_path)
  );

  if (all.length === 0) {
    return (
      <div className="notice">
        <strong>Your closet is empty</strong>
        <p>
          Head to <Link href="/add" className="link">Add</Link>, upload a garment and its
          brand tag, and let it identify the piece. Everything here fills in from there.
        </p>
      </div>
    );
  }

  // What actually needs a human, surfaced instead of buried in a status column.
  const unreviewed = all.filter((i) => i.review_state === "unreviewed").length;
  const unlisted = all.filter(
    (i) => i.review_state !== "unreviewed" && i.listings.length === 0 && i.status !== "sold"
  ).length;
  const stale = all.filter((i) => {
    const shelf = shelfAge(i);
    return i.status === "listed" && shelf !== null && shelf.days >= AGING_DAYS;
  }).length;

  const todo = [
    unreviewed && { href: "/?status=unreviewed", n: unreviewed, label: "to review", tone: "act" },
    unlisted && { href: "/?status=draft", n: unlisted, label: "not listed anywhere", tone: "act" },
    stale && { href: `/?status=listed`, n: stale, label: `sitting over ${AGING_DAYS} days`, tone: "warn" },
  ].filter(Boolean) as { href: string; n: number; label: string; tone: string }[];

  // Above everything, including the heading. A listing still up for something
  // that sold is the only thing on this page that gets worse while you read it.
  const delist = await openDelistTasks();

  return (
    <>
      <DelistQueue tasks={delist} />

      <div className="pagehead">
        <h1>Inventory</h1>
        <p>
          {summary.itemsTotal - (summary.byStatus.sold ?? 0)} on hand ·{" "}
          {summary.byStatus.listed ?? 0} live · {summary.byStatus.sold ?? 0} sold
        </p>
      </div>

      {todo.length > 0 && (
        <div className="todo">
          {todo.map((t) => (
            <Link key={t.label} href={t.href} className={`todochip todochip-${t.tone}`}>
              <b>{t.n}</b> {t.label}
            </Link>
          ))}
        </div>
      )}

      {/* Three numbers, not five. Gross, fees and cost live as subtext. */}
      <div className="tiles">
        <div className="tile tile-hero">
          <span className="tile-label">Profit</span>
          <div className={`tile-value ${summary.profit >= 0 ? "tile-value-pos" : "tile-value-neg"}`}>
            {usd(summary.profit)}
          </div>
          <div className="tile-sub">
            {usd(summary.netProceeds)} net less {usdShort(summary.costOfGoodsSold)} cost
          </div>
        </div>
        <div className="tile">
          <span className="tile-label">Lost to fees</span>
          <div className="tile-value">{usdShort(summary.feesPaid)}</div>
          <div className="tile-sub">
            {pct(summary.grossRevenue ? summary.feesPaid / summary.grossRevenue : 0)} of{" "}
            {usdShort(summary.grossRevenue)} gross
          </div>
        </div>
        <div className="tile">
          <span className="tile-label">Sell-through</span>
          <div className="tile-value">{pct(summary.sellThrough)}</div>
          <div className="tile-sub">{usdShort(summary.inventoryAtCost)} still tied up</div>
        </div>
      </div>

      <details className="disclose">
        <summary>Take rate by channel</summary>
        <div className="channels">
          {summary.byChannel.map((c) => (
            <div key={c.channel} className="channelcard">
              <div className="channelcard-head">
                <span className="channelcard-name">{CHANNEL_LABEL[c.channel]}</span>
                <span className="channelcard-net">{usdShort(c.net)}</span>
              </div>
              <div className="takebar">
                <i style={{ width: `${Math.min(100, Math.round(c.takeRate * 100 * 3))}%` }} />
              </div>
              <div className="channelcard-meta">
                <span>{c.sold} sold · {c.live} live</span>
                <span>{c.gross > 0 ? `${pct(c.takeRate)} take` : "—"}</span>
              </div>
            </div>
          ))}
        </div>
        <p className="prose-fine">
          Take rate is what the platform actually kept, not what it advertises. Every rate is
          still unverified — see <Link href="/settings" className="link">Settings</Link>.
        </p>
      </details>

      <div className="filterbar">
        <Filters params={params} />
        <ChannelViewToggle />
      </div>

      {/* Seven columns on a laptop, stacked cards on a phone. Same markup. */}
      <BulkController>
      <div className="tablewrap">
        <table className="grid grid-lean">
          <thead>
            <tr>
              <th style={{ width: 28 }} />
              <th style={{ width: 64 }} />
              <th>Item</th>
              <th>Channels</th>
              <th className="num">Ask</th>
              <th className="num">Net</th>
              <th className="num">Age</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const shelf = shelfAge(item);
              const aging = item.status === "listed" && shelf !== null && shelf.days >= AGING_DAYS;
              const projection = item.sale ? null : bestProjection(item);
              const net = item.sale ? item.sale.net : projection?.net ?? null;
              const profit = item.sale ? item.sale.profit : net === null ? null : net - item.cost_basis;
              const hero = heroes.get(item.id);
              const url = hero ? signed[hero.storage_path] : undefined;

              return (
                <tr key={item.id}>
                  {/* A plain server-rendered checkbox. BulkController reads
                      these by delegation, so the table stays a server
                      component and selection costs one client island. */}
                  <td data-cell="pick">
                    <input
                      type="checkbox"
                      data-bulk-id={item.id}
                      aria-label={`Select ${item.sku} ${item.title}`}
                    />
                  </td>
                  <td data-cell="thumb">
                    {url ? (
                      <Link href={`/items/${item.id}`} className="rowthumb">
                        <img src={url} alt="" />
                      </Link>
                    ) : (
                      <span
                        className="rowthumb rowthumb-empty"
                        style={{ background: item.swatch ?? "var(--rule)" }}
                        aria-hidden="true"
                      />
                    )}
                  </td>

                  <td data-cell="item">
                    <Link href={`/items/${item.id}`} className="cell-title">
                      {item.title}
                    </Link>
                    <div className="cell-meta">
                      <span className="cell-sku">{item.sku}</span>
                      <span>{item.brand ?? "unbranded"}</span>
                      <span>{item.size}</span>
                      <span>{item.condition}</span>
                    </div>
                  </td>

                  <td data-cell="channels" data-label="Channels">
                    <ChannelActions
                      states={item.listings.map((l) => ({
                        channel: l.channel,
                        listingId: l.id,
                        status: l.status,
                        url: l.url,
                      }))}
                    />
                  </td>

                  <td className="num" data-cell="ask" data-label="Ask">
                    {item.askingPrice ? usd(item.askingPrice) : <span className="muted">—</span>}
                    <div className="cell-sub">{usd(item.cost_basis)} cost</div>
                  </td>

                  <td className="num" data-cell="net" data-label="Net">
                    {net === null ? (
                      <span className="muted">—</span>
                    ) : (
                      <>
                        <span
                          title={
                            projection
                              ? `Best of the channels it's live on: ${CHANNEL_LABEL[projection.channel]}`
                              : `Actual, on ${CHANNEL_LABEL[item.sale!.channel]}`
                          }
                        >
                          {projection ? "~" : ""}
                          {usd(net)}
                          {projection && (
                            <ChannelIcon channel={projection.channel} size={13} />
                          )}
                        </span>
                        {profit !== null && (
                          <div className={`cell-sub ${profit >= 0 ? "num-pos" : "num-neg"}`}>
                            {profit >= 0 ? "+" : ""}
                            {usd(profit)} profit
                          </div>
                        )}
                      </>
                    )}
                  </td>

                  <td className="num" data-cell="age" data-label="Age">
                    {shelf === null ? (
                      <span className="muted">—</span>
                    ) : (
                      <span
                        className={shelf.kind === "to-sell" ? "muted" : undefined}
                        title={shelf.kind === "to-sell" ? "Days to sell" : "Days listed"}
                      >
                        {shelf.days}d
                      </span>
                    )}
                  </td>

                  <td data-cell="status">
                    <span
                      className={`badge badge-${
                        aging ? "aging" : item.review_state === "unreviewed" ? "draft" : item.status
                      }`}
                    >
                      {aging
                        ? "stale"
                        : item.review_state === "unreviewed"
                          ? "unreviewed"
                          : item.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {items.length === 0 && (
        <div className="notice">
          <strong>Nothing matches that filter</strong>
          <p>Clear a filter above to see the rest of the inventory.</p>
        </div>
      )}
      </BulkController>
    </>
  );
}
