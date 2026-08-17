import Link from "next/link";
import ChannelMatrix from "@/components/ChannelMatrix";
import Filters from "@/components/Filters";
import { CHANNEL_ABBR, CHANNEL_ACCESS, CHANNEL_LABEL, projectedNet, type Channel } from "@/lib/fees";
import { usd, usdShort, pct } from "@/lib/money";
import { daysListedFor, getItems, getSummary, isSeeded, type ItemWithChannels } from "@/lib/queries";

export const dynamic = "force-dynamic";

const AGING_DAYS = 45;

/** Best net you'd clear today across the channels this item is actually live on. */
function bestProjection(item: ItemWithChannels): { net: number; channel: Channel } | null {
  const live = item.listings.filter((l) => l.status === "live");
  if (!live.length) return null;

  const scored = live.map((l) => ({
    channel: l.channel,
    net: projectedNet(l.channel, l.price, {
      shippingCollected: l.shipping_price,
      shippingCost: l.shipping_price, // fixtures assume you break even on postage
    }),
  }));

  return scored.reduce((best, cur) => (cur.net > best.net ? cur : best));
}

/**
 * Days on the shelf. For a live item that's how long it's been sitting; for a sold
 * one it's how long it took to sell. Same column, and the distinction is the
 * whole point — one is a problem, the other is a benchmark.
 */
function age(item: ItemWithChannels): { days: number; kind: "listed" | "to-sell" } | null {
  if (item.sale) {
    const soldListing = item.listings.find((l) => l.status === "sold");
    if (soldListing?.posted_at) {
      const posted = Date.parse(`${soldListing.posted_at}T00:00:00Z`);
      const sold = Date.parse(`${item.sale.sold_at}T00:00:00Z`);
      if (!Number.isNaN(posted) && !Number.isNaN(sold)) {
        return { days: Math.max(0, Math.round((sold - posted) / 86_400_000)), kind: "to-sell" };
      }
    }
    return null;
  }
  const listed = daysListedFor(item);
  return listed === null ? null : { days: listed, kind: "listed" };
}

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = {
    status: typeof sp.status === "string" ? sp.status : "all",
    channel: typeof sp.channel === "string" ? sp.channel : "all",
    sort: typeof sp.sort === "string" ? sp.sort : "sku",
  };

  if (!isSeeded()) {
    return (
      <div className="notice">
        <strong>No items yet</strong>
        <p>
          Run <code>npm run seed</code> to load the 30 fixture garments, or start adding your own.
        </p>
      </div>
    );
  }

  const summary = getSummary();
  const items = getItems(params);

  return (
    <>
      <div className="tiles">
        <div className="tile tile-hero">
          <span className="tile-label">Net proceeds</span>
          <div className="tile-value">{usd(summary.netProceeds)}</div>
          <div className="tile-sub">after {usd(summary.feesPaid)} fees + postage</div>
        </div>
        <div className="tile tile-hero">
          <span className="tile-label">Profit</span>
          <div className={`tile-value ${summary.profit >= 0 ? "tile-value-pos" : "tile-value-neg"}`}>
            {usd(summary.profit)}
          </div>
          <div className="tile-sub">less {usd(summary.costOfGoodsSold)} cost of goods</div>
        </div>
        <div className="tile">
          <span className="tile-label">Gross</span>
          <div className="tile-value">{usdShort(summary.grossRevenue)}</div>
          <div className="tile-sub">
            {pct(summary.grossRevenue ? summary.feesPaid / summary.grossRevenue : 0)} lost to fees
          </div>
        </div>
        <div className="tile">
          <span className="tile-label">Sell-through</span>
          <div className="tile-value">{pct(summary.sellThrough)}</div>
          <div className="tile-sub">
            {summary.byStatus.sold ?? 0} sold · {summary.byStatus.listed ?? 0} live
          </div>
        </div>
        <div className="tile">
          <span className="tile-label">Inventory at cost</span>
          <div className="tile-value">{usdShort(summary.inventoryAtCost)}</div>
          <div className="tile-sub">
            {summary.itemsTotal - (summary.byStatus.sold ?? 0)} garments on hand
          </div>
        </div>
      </div>

      <div className="sectionhead">
        <h2>By channel</h2>
        <p>Take rate is what the platform kept, not what it advertises.</p>
      </div>
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
              <span>
                {c.sold} sold · {c.live} live
              </span>
              <span>{c.gross > 0 ? `${pct(c.takeRate)} take` : CHANNEL_ACCESS[c.channel]}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="sectionhead">
        <h2>Inventory</h2>
        <p>
          {items.length} of {summary.itemsTotal} items
        </p>
      </div>

      <Filters params={params} />

      <div className="tablewrap">
        <table className="grid">
          <thead>
            <tr>
              <th style={{ width: 46 }} />
              <th>SKU</th>
              <th>Item</th>
              <th>Channels</th>
              <th className="num">Ask</th>
              <th className="num">Cost</th>
              <th className="num">Days</th>
              <th className="num">Net</th>
              <th className="num">Profit</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const shelf = age(item);
              const aging = item.status === "listed" && shelf !== null && shelf.days >= AGING_DAYS;
              const projection = item.sale ? null : bestProjection(item);
              const net = item.sale ? item.sale.net : projection?.net ?? null;
              const profit = item.sale ? item.sale.profit : net === null ? null : net - item.cost_basis;

              return (
                <tr key={item.id}>
                  <td>
                    <span
                      className="swatch"
                      style={{ background: item.swatch ?? "var(--rule)" }}
                      aria-hidden="true"
                    />
                  </td>
                  <td className="cell-sku">{item.sku}</td>
                  <td>
                    <Link href={`/items/${item.id}`} className="cell-title">
                      {item.title}
                    </Link>
                    <div className="cell-meta">
                      <span>{item.brand ?? "unbranded"}</span>
                      <span>{item.size}</span>
                      <span>{item.condition}</span>
                    </div>
                  </td>
                  <td>
                    <ChannelMatrix listings={item.listings} />
                  </td>
                  <td className="num">{item.askingPrice ? usd(item.askingPrice) : <span className="muted">—</span>}</td>
                  <td className="num muted">{usd(item.cost_basis)}</td>
                  <td className="num">
                    {shelf === null ? (
                      <span className="muted">—</span>
                    ) : (
                      <span
                        className={shelf.kind === "to-sell" ? "muted" : undefined}
                        title={shelf.kind === "to-sell" ? "Days to sell" : "Days listed"}
                      >
                        {shelf.days}
                      </span>
                    )}
                  </td>
                  <td className="num">
                    {net === null ? (
                      <span className="muted">—</span>
                    ) : projection ? (
                      <span title={`Best of the channels it's live on: ${CHANNEL_LABEL[projection.channel]}`}>
                        ~{usd(net)} <span className="muted">{CHANNEL_ABBR[projection.channel]}</span>
                      </span>
                    ) : (
                      <span title={`Actual, on ${CHANNEL_LABEL[item.sale!.channel]}`}>{usd(net)}</span>
                    )}
                  </td>
                  <td className={`num ${profit === null ? "" : profit >= 0 ? "num-pos" : "num-neg"}`}>
                    {profit === null ? <span className="muted">—</span> : `${projection ? "~" : ""}${usd(profit)}`}
                  </td>
                  <td>
                    <span className={`badge badge-${aging ? "aging" : item.status}`}>
                      {aging ? `${shelf!.days}d stale` : item.status}
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
    </>
  );
}
