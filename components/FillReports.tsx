import { CHANNEL_LABEL } from "@/lib/fees";
import type { FillReport } from "@/lib/data";
import ChannelIcon from "./ChannelIcon";

/**
 * What each marketplace form said the last time Flock filled it.
 *
 * Every fill bug in this project was found the same way: a seller photographs a
 * red error and describes it to someone who can read a DOM. Depop's condition
 * menu says "Brand new" and our table said "Brand new with tags"; Depop caps
 * photos at eight and we sent eleven; Depop's shoe sizes are US-only and the
 * garment said 42. All three were visible on the page the whole time.
 *
 * So this shows the page's own words. It only appears when something actually
 * went wrong — a clean fill has nothing worth saying.
 */
export default function FillReports({ reports }: { reports: FillReport[] }) {
  const problems = reports.filter(
    (r) => r.missing.length > 0 || r.blocked.length > 0 || r.errors.length > 0
  );
  if (problems.length === 0) return null;

  return (
    <>
      <div className="sectionhead">
        <h2>What the forms said</h2>
        <p>
          The last fill on each channel, in the marketplace&apos;s own words. Nothing here was
          submitted.
        </p>
      </div>

      <div className="reports">
        {problems.map((report) => (
          <div key={report.id} className="report">
            <div className="report-head">
              <ChannelIcon channel={report.channel} />
              <strong>{CHANNEL_LABEL[report.channel]}</strong>
              <span className="muted">
                {report.filled.length} filled
                {report.missing.length > 0 && `, ${report.missing.length} not`}
              </span>
            </div>

            {report.errors.length > 0 && (
              <ul className="report-errors">
                {report.errors.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            )}

            {report.missing.length > 0 && (
              <p className="report-missing">{report.missing.join(" · ")}</p>
            )}

            {/* The controls the page still considers empty. This is the list
                that tells you a field exists that Flock has never heard of. */}
            {(() => {
              const empty = report.controls.filter((c) => c.label && !c.value);
              if (empty.length === 0) return null;
              return (
                <p className="muted report-empty">
                  Still empty: {empty.map((c) => c.label).slice(0, 12).join(", ")}
                </p>
              );
            })()}
          </div>
        ))}
      </div>
    </>
  );
}
