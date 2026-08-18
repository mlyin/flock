"use client";

import { useEffect, useState } from "react";

/**
 * Asks the extension to open a marketplace's sell page, read its structure, and
 * report back — filling nothing, clicking nothing, submitting nothing.
 *
 * This replaces pointing browser automation at a marketplace to find its
 * selectors, which turned out to be detectable: Poshmark refused a request
 * outright while a debugger was attached, and Mercari and Facebook served
 * automated tabs a stripped or logged-out page. The extension is already an
 * ordinary part of this browser, so what it sees is the real form.
 *
 * The output is meant to be copied into a conversation or into SELECTORS.md.
 * It reports the SHAPE of each control — readonly panel opener vs plain input,
 * and which ARIA roles the options use — because that distinction is what cost
 * two rounds of failed Vinted fills.
 */
const CHANNELS = [
  { id: "facebook", label: "Facebook Marketplace" },
  { id: "mercari", label: "Mercari" },
  { id: "poshmark", label: "Poshmark" },
  { id: "depop", label: "Depop" },
  { id: "vinted", label: "Vinted" },
  { id: "grailed", label: "Grailed" },
];

export default function ProbeForm() {
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const check = () =>
      setInstalled(document.documentElement.hasAttribute("data-threader-extension"));
    check();

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (data?.source !== "threader-extension") return;
      if (data.type === "ready") check();

      if (data.type === "probed") {
        setBusy(null);
        if (!data.ok) return setError(data.error ?? "The probe didn't come back.");
        setError(
          data.report?.looksSignedOut
            ? `That page looks signed out — sign in to ${data.channel} in this browser and probe again.`
            : null
        );
        setReport(JSON.stringify(data.report, null, 2));
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const probe = (channel: string) => {
    setReport(null);
    setError(null);
    setBusy(channel);
    window.postMessage({ source: "threader-page", type: "probe", channel }, window.location.origin);
  };

  if (!installed) return null;

  return (
    <>
      <div className="sectionhead">
        <h2>Read a sell form</h2>
        <p>Opens the page in a background tab, reports what&apos;s on it, changes nothing.</p>
      </div>

      <div className="notice">
        <p className="muted" style={{ marginTop: 0 }}>
          For adding a marketplace, or working out why a fill skipped a field. Nothing is typed
          or clicked — it only looks.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {CHANNELS.map((c) => (
            <button
              key={c.id}
              type="button"
              className="button button-sm"
              disabled={Boolean(busy)}
              onClick={() => probe(c.id)}
            >
              {busy === c.id ? "Reading…" : c.label}
            </button>
          ))}
        </div>

        {error && <p className="chipnote chipnote-bad" style={{ marginTop: 12 }}>{error}</p>}

        {report && (
          <>
            <button
              type="button"
              className="button button-sm button-quiet"
              style={{ marginTop: 12 }}
              onClick={() => navigator.clipboard.writeText(report)}
            >
              Copy report
            </button>
            <pre
              style={{
                marginTop: 10,
                maxHeight: 340,
                overflow: "auto",
                fontSize: 11.5,
                lineHeight: 1.45,
                background: "var(--surface)",
                border: "1px solid var(--rule-2)",
                borderRadius: 10,
                padding: 12,
              }}
            >
              {report}
            </pre>
          </>
        )}
      </div>
    </>
  );
}
