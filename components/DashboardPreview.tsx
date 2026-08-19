/**
 * A picture of the product, drawn rather than screenshotted.
 *
 * Built in markup instead of a PNG so it stays sharp, follows the visitor's
 * light/dark setting, and can't go stale the way a screenshot does the first
 * time the real dashboard changes.
 *
 * The garments are illustrative and labelled as such in the caption — this is a
 * mockup of the interface, not a claim about anyone's sales. Everything it
 * shows is something the app actually does: per-channel status, the ask, and
 * the net after that channel's fees.
 */

const ROWS = [
  {
    item: "Carhartt Detroit Jacket",
    meta: "Brown · L · good",
    live: ["DP", "GR"],
    drafted: ["VT", "MC"],
    ask: "$165",
    net: "$149",
    best: "Vinted",
  },
  {
    item: "Alo Yoga Soho Pullover",
    meta: "Ivory · L · excellent",
    live: ["VT"],
    drafted: ["DP", "PM", "MC"],
    ask: "$80",
    net: "$80",
    best: "Vinted",
  },
  {
    item: "Levi's 501 Original",
    meta: "Indigo · 32×32 · good",
    live: ["DP"],
    drafted: ["EB", "GR"],
    ask: "$58",
    net: "$49",
    best: "Depop",
  },
];

export default function DashboardPreview() {
  return (
    <figure className="preview">
      <div className="preview-frame" aria-hidden>
        <div className="preview-bar">
          <span className="preview-dot" />
          <span className="preview-dot" />
          <span className="preview-dot" />
          <span className="preview-url">sellonflock.com</span>
        </div>

        <div className="preview-body">
          <div className="preview-tiles">
            <div className="preview-tile">
              <span>Profit</span>
              <strong className="preview-pos">$412.60</strong>
              <em>$1,240 net less $827 cost</em>
            </div>
            <div className="preview-tile">
              <span>Lost to fees</span>
              <strong>$96.40</strong>
              <em>7.2% of gross</em>
            </div>
            <div className="preview-tile">
              <span>Sell-through</span>
              <strong>48%</strong>
              <em>$610 still tied up</em>
            </div>
          </div>

          <table className="preview-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Channels</th>
                <th className="num">Ask</th>
                <th className="num">Net</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.item}>
                  <td>
                    <strong>{row.item}</strong>
                    <em>{row.meta}</em>
                  </td>
                  <td>
                    <span className="preview-chips">
                      {row.live.map((c) => (
                        <i key={c} className="preview-chip preview-chip-live">
                          {c}
                        </i>
                      ))}
                      {row.drafted.map((c) => (
                        <i key={c} className="preview-chip">
                          {c}
                        </i>
                      ))}
                    </span>
                  </td>
                  <td className="num">{row.ask}</td>
                  <td className="num">
                    <strong className="preview-pos">{row.net}</strong>
                    <em>best on {row.best}</em>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <figcaption>
        Sample data. Filled chips are live listings, outlined ones are drafted and waiting.
      </figcaption>
    </figure>
  );
}
