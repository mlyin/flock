import Link from "next/link";
import { notFound } from "next/navigation";
import ReviewForm from "@/components/ReviewForm";
import ListingDrafts from "@/components/ListingDrafts";
import { CHANNELS, CHANNEL_ACCESS, CHANNEL_LABEL, computeFees, projectedNet } from "@/lib/fees";
import { LISTABLE } from "@/lib/listing";
import { usd, shortDate, daysSince } from "@/lib/money";
import { daysListedFor, getItem, signPhotos } from "@/lib/data";
import { latestInference } from "@/lib/intake";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getItem(id);
  if (!item) notFound();

  const days = daysListedFor(item);
  const held = daysSince(item.acquired_at);
  const signed = await signPhotos(item.photos.map((p) => p.storage_path));

  const supabase = await supabaseServer();
  const { data: profile } = await supabase.from("profiles").select("ship_line1").maybeSingle();

  const unreviewed = item.review_state === "unreviewed";
  const inference = unreviewed ? await latestInference(item.id) : null;
  const fields = (inference?.fields ?? {}) as { questions?: string[] };
  const confidence = (inference?.confidence ?? {}) as Record<string, number>;

  return (
    <>
      <div className="sectionhead">
        <h2>
          <Link href="/">← Inventory</Link>
        </h2>
      </div>

      <div className="detail">
        <div>
          {item.photos.length > 0 ? (
            <div className="shots shots-detail">
              {item.photos.map((photo) => {
                const url = signed[photo.storage_path];
                if (!url) return null;
                return (
                  <a key={photo.id} className="shot" href={url} target="_blank" rel="noreferrer">
                    <img src={url} alt={photo.role} />
                    <span className="shot-meta">
                      <span className="shot-name">{photo.role}</span>
                    </span>
                  </a>
                );
              })}
            </div>
          ) : (
            <div className="hero" style={{ background: item.swatch ?? "var(--surface)" }}>
              <span>No photo yet</span>
            </div>
          )}

          <dl className="spec">
            <div>
              <dt>SKU</dt>
              <dd>{item.sku}</dd>
            </div>
            <div>
              <dt>Brand</dt>
              <dd>{item.brand ?? "—"}</dd>
            </div>
            <div>
              <dt>Category</dt>
              <dd>{item.category}</dd>
            </div>
            <div>
              <dt>Size</dt>
              <dd>{item.size ?? "—"}</dd>
            </div>
            <div>
              <dt>Colour</dt>
              <dd>{item.color ?? "—"}</dd>
            </div>
            <div>
              <dt>Material</dt>
              <dd>{item.material ?? "—"}</dd>
            </div>
            <div>
              <dt>Condition</dt>
              <dd>{item.condition}</dd>
            </div>
            <div>
              <dt>Cost basis</dt>
              <dd>{usd(item.cost_basis)}</dd>
            </div>
            <div>
              <dt>Sourced</dt>
              <dd>
                {item.source ?? "—"}
                {held !== null && <span className="muted"> · {held}d ago</span>}
              </dd>
            </div>
          </dl>
        </div>

        <div>
          <h1>{item.title}</h1>
          <div className="detail-sub">
            <span className={`badge badge-${unreviewed ? "draft" : item.status}`}>
              {unreviewed ? "unreviewed" : item.status}
            </span>
            {days !== null && <span>listed {days} days ago</span>}
            {item.sale && <span>sold on {CHANNEL_LABEL[item.sale.channel]}</span>}
          </div>

          {/* Always editable. A confirmed item still needs correcting — a wrong
              size or a missing package size shouldn't require starting over. */}
          <div className="sectionhead">
            <h2>{unreviewed ? "Unreviewed draft" : "Details"}</h2>
            <p>
              {unreviewed
                ? `Read from the photos by ${inference?.model ?? "the model"}. Correct anything wrong.`
                : "Change anything and save."}
            </p>
          </div>
          <ReviewForm
            item={item}
            confidence={confidence}
            questions={fields.questions ?? []}
            reviewed={!unreviewed}
          />

          {!unreviewed && (
            <ListingDrafts
              itemId={item.id}
              addressSet={Boolean(profile?.ship_line1)}
              listings={item.listings
                .filter((l) => LISTABLE.includes(l.channel))
                .map((l) => ({
                  id: l.id,
                  channel: l.channel,
                  title: l.title,
                  description: l.description,
                  price: l.price,
                  draft: l.draft,
                }))}
            />
          )}

          {item.listings.some((l) => l.status !== "draft") && (
            <>
              <div className="sectionhead">
                <h2>Live listings</h2>
                <p>One row per channel. Net is what you&apos;d clear at that price.</p>
              </div>
              <div className="tablewrap">
                <table className="grid" style={{ minWidth: 620 }}>
                  <thead>
                    <tr>
                      <th>Channel</th>
                      <th>Access</th>
                      <th className="num">Price</th>
                      <th className="num">Postage</th>
                      <th className="num">Net</th>
                      <th>Status</th>
                      <th>Posted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.listings.filter((l) => l.status !== "draft").map((listing) => (
                      <tr key={listing.id}>
                        <td style={{ fontWeight: 600 }}>{CHANNEL_LABEL[listing.channel]}</td>
                        <td className="cell-sku">{CHANNEL_ACCESS[listing.channel]}</td>
                        <td className="num">{usd(listing.price)}</td>
                        <td className="num muted">
                          {listing.shipping_price ? usd(listing.shipping_price) : "included"}
                        </td>
                        <td className="num">
                          {usd(
                            projectedNet(listing.channel, listing.price, {
                              shippingCollected: listing.shipping_price,
                              shippingCost: listing.shipping_price,
                            })
                          )}
                        </td>
                        <td>
                          <span className={`badge badge-${listing.status === "live" ? "listed" : "draft"}`}>
                            {listing.status}
                          </span>
                        </td>
                        <td className="cell-sku">{shortDate(listing.posted_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {item.sale && (
            <>
              <div className="sectionhead">
                <h2>What you actually made</h2>
                <p>Sold {shortDate(item.sale.sold_at)}</p>
              </div>
              <div className="ledger">
                <div className="ledger-row">
                  <span>Sold price</span>
                  <span>{usd(item.sale.sold_price)}</span>
                </div>
                {item.sale.shipping_collected > 0 && (
                  <div className="ledger-row">
                    <span>Postage collected</span>
                    <span>{usd(item.sale.shipping_collected)}</span>
                  </div>
                )}
                {item.sale.fees.map((fee) => (
                  <div key={fee.id} className="ledger-row ledger-fee">
                    <span>{fee.label}</span>
                    <span>−{usd(fee.amount)}</span>
                  </div>
                ))}
                {item.sale.shipping_cost > 0 && (
                  <div className="ledger-row ledger-fee">
                    <span>Label cost</span>
                    <span>−{usd(item.sale.shipping_cost)}</span>
                  </div>
                )}
                <div className="ledger-row ledger-total">
                  <span>Net proceeds</span>
                  <span>{usd(item.sale.net)}</span>
                </div>
                <div className="ledger-row ledger-fee">
                  <span>Cost basis</span>
                  <span>−{usd(item.cost_basis)}</span>
                </div>
                <div className="ledger-row ledger-total">
                  <span>Profit</span>
                  <span className={item.sale.profit >= 0 ? "num-pos" : "num-neg"}>
                    {usd(item.sale.profit)}
                  </span>
                </div>
              </div>
            </>
          )}

          {!item.sale && item.askingPrice && (
            <>
              <div className="sectionhead">
                <h2>If it sold today at {usd(item.askingPrice)}</h2>
                <p>Fees only, postage excluded, so the channels compare like for like.</p>
              </div>
              <div className="ledger">
                {CHANNELS.map((channel) => {
                  const ask = item.askingPrice!;
                  const fees = computeFees(channel, { soldPrice: ask, shippingCollected: 0 });
                  const total = fees.reduce((s, f) => s + f.amount, 0);
                  const alreadyOn = item.listings.some((l) => l.channel === channel);
                  return (
                    <div key={channel} className="ledger-row">
                      <span>
                        {CHANNEL_LABEL[channel]}
                        {!alreadyOn && <span className="muted"> · not listed here</span>}
                      </span>
                      <span>
                        {usd(projectedNet(channel, ask))}
                        <span className="muted"> · {usd(total)} fees</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
