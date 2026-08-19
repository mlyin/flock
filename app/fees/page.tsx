import { CHANNELS, CHANNEL_ACCESS, CHANNEL_LABEL, FEE_RULES, computeFees, projectedNet } from "@/lib/fees";
import { usd } from "@/lib/money";

export const dynamic = "force-dynamic";

/** Prices chosen to straddle Poshmark's flat-fee threshold, where the ranking flips. */
const PRICE_POINTS = [12, 25, 60, 150];

export default async function FeesPage() {
  return (
    <>
      <div className="sectionhead">
        <h2>Fee rules</h2>
        <p>Stored as data, not code — edit lib/fees.ts and everything downstream re-computes.</p>
      </div>

      <div className="notice">
        <strong>Every rate here is unverified</strong>
        <p>
          These were written from public fee pages and will go stale. Check each channel&apos;s current
          fee schedule and update <code>lib/fees.ts</code>, then set <code>verifiedOn</code> to the date
          you checked. The dashboard&apos;s net figures are only as honest as this table.
        </p>
      </div>

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
                  <td style={{ fontWeight: 650 }}>{CHANNEL_LABEL[channel]}</td>
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
                            {rule.label}:{" "}
                            {rule.type === "percent"
                              ? `${(rule.rate * 100).toFixed(2)}%`
                              : rule.type === "flat"
                                ? usd(rule.amount)
                                : rule.type === "tiered"
                                  ? `${usd(rule.below.amount)} under ${usd(rule.threshold)}, else ${(
                                      rule.atOrAbove.rate * 100
                                    ).toFixed(0)}%`
                                  : rule.type === "tiered_percent"
                                    ? `${(rule.below.rate * 100).toFixed(0)}%${rule.below.min ? ` (min ${usd(rule.below.min)})` : ""} under ${usd(rule.threshold)}, else ${(rule.atOrAbove.rate * 100).toFixed(0)}%`
                                    : `${usd(rule.below.amount)} to ${usd(rule.threshold)}, else ${usd(rule.atOrAbove.amount)}`}
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
                <td style={{ fontWeight: 650 }}>{CHANNEL_LABEL[channel]}</td>
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
