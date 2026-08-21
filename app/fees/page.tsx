import { CHANNELS, CHANNEL_ACCESS, CHANNEL_LABEL, FEE_RULES, computeFees, describeRule, projectedNet, unverifiedChannels } from "@/lib/fees";
import ChannelIcon from "@/components/ChannelIcon";
import { usd } from "@/lib/money";

export const dynamic = "force-dynamic";

/** Prices chosen to straddle Poshmark's flat-fee threshold, where the ranking flips. */
const PRICE_POINTS = [12, 25, 60, 150];

export default async function FeesPage() {
  const unverified = unverifiedChannels();

  return (
    <>
      <div className="sectionhead">
        <h2>Fee rules</h2>
        <p>Stored as data, not code — edit lib/fees.ts and everything downstream re-computes.</p>
      </div>

      {unverified.length > 0 ? (
        <div className="notice notice-warn">
          <strong>
            {unverified.length} of {CHANNELS.length} rates {unverified.length === 1 ? "is" : "are"} unverified
          </strong>
          <p>
            {unverified.map((c) => CHANNEL_LABEL[c]).join(", ")} —{" "}
            {unverified.length === 1 ? "its rate was" : "their rates were"} written from memory, not from the
            marketplace&apos;s own fee page. Every net figure for{" "}
            {unverified.length === 1 ? "that channel" : "those channels"} is a guess. Check the official
            schedule, update <code>lib/fees.ts</code>, and set <code>verifiedOn</code> to the date you checked.
          </p>
        </div>
      ) : (
        <div className="notice">
          <strong>Every rate here was read off the marketplace&apos;s own fee page</strong>
          <p>
            Not a blog, not a comparison table — those are where confidently wrong numbers come from. Each
            note carries its source URL and the date it was checked. Rates drift, so the dates matter as
            much as the rates: the dashboard&apos;s net figures are only as honest as this table.
          </p>
        </div>
      )}

      <div className="tablewrap">
        <table className="grid" style={{ minWidth: 720 }}>
          <thead>
            <tr>
              <th>Channel</th>
              <th>Access</th>
              <th>Rules</th>
              <th>Verified</th>
            </tr>
          </thead>
          <tbody>
            {CHANNELS.map((channel) => {
              const config = FEE_RULES[channel];
              return (
                <tr key={channel}>
                  <td style={{ fontWeight: 650 }}>
                  <ChannelIcon channel={channel} /> {CHANNEL_LABEL[channel]}
                </td>
                  <td>
                    <span className={`badge badge-${CHANNEL_ACCESS[channel] === "api" ? "listed" : "draft"}`}>
                      {CHANNEL_ACCESS[channel]}
                    </span>
                  </td>
                  <td>
                    {config.rules.length === 0 ? (
                      <span className="muted">No seller-side fee</span>
                    ) : (
                      <div className="cell-meta" style={{ fontSize: 11.5 }}>
                        {config.rules.map((rule) => (
                          <span key={rule.label}>
                            {rule.label}: {describeRule(rule)}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="cell-meta">{config.note}</div>
                  </td>
                  <td className="cell-sku muted">{config.verifiedOn}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="sectionhead">
        <h2>Net at a given price</h2>
        <p>Postage excluded, so this is fees only. Note where the ranking flips.</p>
      </div>

      <div className="tablewrap">
        <table className="grid" style={{ minWidth: 620 }}>
          <thead>
            <tr>
              <th>Channel</th>
              {PRICE_POINTS.map((price) => (
                <th key={price} className="num">
                  {usd(price)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CHANNELS.map((channel) => (
              <tr key={channel}>
                <td style={{ fontWeight: 650 }}>
                  <ChannelIcon channel={channel} /> {CHANNEL_LABEL[channel]}
                </td>
                {PRICE_POINTS.map((price) => {
                  const fees = computeFees(channel, { soldPrice: price, shippingCollected: 0 });
                  const feeTotal = fees.reduce((s, f) => s + f.amount, 0);
                  const best =
                    projectedNet(channel, price) ===
                    Math.max(...CHANNELS.map((c) => projectedNet(c, price)));
                  return (
                    <td key={price} className={`num ${best ? "num-pos" : ""}`}>
                      {usd(projectedNet(channel, price))}
                      <div className="cell-meta" style={{ justifyContent: "flex-end" }}>
                        <span>−{usd(feeTotal)}</span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
