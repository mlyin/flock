"use client";

import { useEffect, useState } from "react";

/**
 * The extension's behaviour settings, on the site where they belong.
 *
 * They used to live in the toolbar popup, which meant the two things you'd
 * actually want to change — does it submit for me, and do I get to watch —
 * were hidden behind an icon you had to remember existed.
 *
 * They can't be stored server-side: they're read by the extension's service
 * worker from chrome.storage.local, which no web page can write to. So this
 * asks the extension to set them, over the same postMessage bridge the Fill
 * buttons already use, and renders nothing at all when the extension isn't
 * installed — a toggle that silently does nothing is worse than no toggle.
 */
export default function ExtensionSettings() {
  const [installed, setInstalled] = useState(false);
  const [prefs, setPrefs] = useState<{ autoSubmit: boolean; background: boolean } | null>(null);
  const [depopUsername, setDepopUsername] = useState("");
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    const check = () =>
      setInstalled(document.documentElement.hasAttribute("data-threader-extension"));
    check();

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (data?.source !== "threader-extension") return;

      if (data.type === "ready") {
        check();
        window.postMessage({ source: "threader-page", type: "get-prefs" }, window.location.origin);
      }
      if (data.type === "prefs") {
        setPrefs({ autoSubmit: Boolean(data.autoSubmit), background: Boolean(data.background) });
        setDepopUsername(data.depopUsername ?? "");
      }
    };

    window.addEventListener("message", onMessage);
    // Ask straight away too: if the extension loaded before this component
    // mounted, its "ready" message has already been and gone.
    window.postMessage({ source: "threader-page", type: "get-prefs" }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const update = (patch: Record<string, unknown>) => {
    window.postMessage(
      { source: "threader-page", type: "set-prefs", prefs: patch },
      window.location.origin
    );
    setPrefs((p) => ({ ...(p ?? { autoSubmit: false, background: false }), ...patch } as typeof prefs & object));
    setSaved("Saved");
    setTimeout(() => setSaved(null), 1600);
  };

  if (!installed) return null;

  return (
    <>
      <div className="sectionhead">
        <h2>How filling behaves</h2>
        <p>{saved ?? "Applies to every marketplace."}</p>
      </div>

      <div className="notice">
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={prefs?.autoSubmit ?? false}
            onChange={(e) => update({ autoSubmit: e.target.checked })}
          />
          <span>
            <strong>Publish automatically</strong>
            <br />
            <span className="muted">
              Only when every required field is filled — a form with holes in it is left for you.
              Mercari always ignores this: its invisible reCAPTCHA scores exactly the behaviour a
              scripted click produces.
            </span>
          </span>
        </label>

        <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <input
            type="checkbox"
            checked={prefs?.background ?? false}
            onChange={(e) => update({ background: e.target.checked })}
          />
          <span>
            <strong>Fill in a hidden window</strong>
            <br />
            <span className="muted">
              Keeps the marketplace out of your way. It still comes to the front if something
              needs you.
            </span>
          </span>
        </label>
      </div>

      <div className="sectionhead">
        <h2>Depop shop</h2>
        <p>Needed to read back your live listings and sold items.</p>
      </div>
      <div className="notice">
        <label style={{ display: "block" }}>
          <span className="muted" style={{ display: "block", marginBottom: 6 }}>
            Your Depop username — the shop slug can&apos;t be derived from anything we already hold.
          </span>
          <input
            type="text"
            value={depopUsername}
            placeholder="yumseller22"
            onChange={(e) => setDepopUsername(e.target.value)}
            onBlur={(e) =>
              update({
                // Tolerate a pasted profile URL as well as a bare handle.
                depopUsername: e.target.value
                  .trim()
                  .replace(/^.*depop\.com\//i, "")
                  .replace(/\/+$/, ""),
              })
            }
          />
        </label>
      </div>
    </>
  );
}
