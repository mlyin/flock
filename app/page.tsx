import Link from "next/link";
import ChannelActions from "@/components/ChannelActions";
import Filters from "@/components/Filters";
import { CHANNEL_ABBR, CHANNEL_ACCESS, CHANNEL_LABEL } from "@/lib/fees";
import { usd, usdShort, pct } from "@/lib/money";
import { bestProjection, getItems, shelfAge, signPhotos, summarize } from "@/lib/data";

export const dynamic = "force-dynamic";

const AGING_DAYS = 45;

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
              <th style={{ width: 72 }} />
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
              const shelf = shelfAge(item);
              const aging = item.status === "listed" && shelf !== null && shelf.days >= AGING_DAYS;
              const projection = item.sale ? null : bestProjection(item);
              const net = item.sale ? item.sale.net : projection?.net ?? null;
              const profit = item.sale ? item.sale.profit : net === null ? null : net - item.cost_basis;

              return (
                <tr key={item.id}>
                  <td>
                    {(() => {
                      const hero = heroes.get(item.id);
                      const url = hero ? signed[hero.storage_path] : undefined;
                      return url ? (
                        <Link href={`/items/${item.id}`} className="rowthumb">
                          <img src={url} alt="" />
                        </Link>
                      ) : (
                        <span
                          className="rowthumb rowthumb-empty"
                          style={{ background: item.swatch ?? "var(--rule)" }}
                          aria-hidden="true"
                        />
                      );
                    })()}
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
                    <ChannelActions
                      states={item.listings.map((l) => ({
                        channel: l.channel,
                        listingId: l.id,
                        status: l.status,
                        url: l.url,
                      }))}
                    />
                  </td>
                  <td className="num">
                    {item.askingPrice ? usd(item.askingPrice) : <span className="muted">—</span>}
                  </td>
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
                    <span
                      className={`badge badge-${aging ? "aging" : item.review_state === "unreviewed" ? "draft" : item.status}`}
                    >
                      {aging ? `${shelf!.days}d stale` : item.review_state === "unreviewed" ? "unreviewed" : item.status}
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
