/**
 * Page ↔ extension bridge, injected into Flock only.
 *
 * Lets the item page show a real "Fill on Depop" button instead of making you
 * hunt for the toolbar icon. Uses window.postMessage rather than
 * externally_connectable because an unpacked extension gets a fresh random ID
 * on every install — the page would have no stable ID to address.
 *
 * Only two message types cross the boundary, both originating from the page's
 * own origin, and neither carries anything but a listing id.
 */

// Tell the page we exist, so it can show the button rather than an install prompt.
//
// The attribute carries the version rather than "1". Manual installs never
// auto-update, so someone can run a build from weeks ago — with a selector fix
// they don't have — and the failure looks exactly like the marketplace having
// changed. The page compares this against the version it shipped with and says
// so. Any truthy value still satisfies the older hasAttribute() checks.
const VERSION = chrome.runtime.getManifest().version;
document.documentElement.setAttribute("data-threader-extension", VERSION);
window.postMessage(
  { source: "threader-extension", type: "ready", version: VERSION },
  window.location.origin
);

window.addEventListener("message", (event) => {
  // Same-origin only: never act on a message another site framed in.
  if (event.origin !== window.location.origin) return;
  if (event.source !== window) return;

  const data = event.data;
  if (!data || data.source !== "threader-page") return;

  // Extension preferences live in chrome.storage.local, which no page can
  // touch — so the settings UI asks the extension to read and write them.
  if (data.type === "probe" && typeof data.channel === "string") {
    chrome.runtime.sendMessage({ type: "probe", channel: data.channel }, (result) => {
      window.postMessage(
        { source: "threader-extension", type: "probed", channel: data.channel,
          ok: Boolean(result?.ok), error: result?.error ?? null, report: result?.data ?? null },
        window.location.origin
      );
    });
    return;
  }

  if (data.type === "get-prefs") {
    chrome.runtime.sendMessage({ type: "get-prefs" }, (result) => {
      window.postMessage(
        { source: "threader-extension", type: "prefs", ...(result?.data ?? {}) },
        window.location.origin
      );
    });
    return;
  }

  if (data.type === "set-prefs" && data.prefs && typeof data.prefs === "object") {
    chrome.runtime.sendMessage({ type: "set-prefs", prefs: data.prefs });
    return;
  }

  if (data.type === "sync-messages" && typeof data.channel === "string") {
    chrome.runtime.sendMessage({ type: "sync-messages", channel: data.channel }, (result) => {
      window.postMessage(
        {
          source: "threader-extension",
          type: "messages-synced",
          channel: data.channel,
          ok: Boolean(result?.ok),
          error: result?.error ?? null,
          imported: result?.data?.imported ?? 0,
          matched: result?.data?.matched ?? 0,
        },
        window.location.origin
      );
    });
    return;
  }

  if (data.type === "sync-shop" && typeof data.channel === "string") {
    chrome.runtime.sendMessage(
      { type: "sync-shop", channel: data.channel, username: data.username },
      (result) => {
        window.postMessage(
          {
            source: "threader-extension",
            type: "shop-synced",
            channel: data.channel,
            ok: Boolean(result?.ok),
            error: result?.error ?? null,
            found: result?.data?.found ?? 0,
            matched: result?.data?.matched ?? 0,
            ambiguous: result?.data?.ambiguous ?? 0,
          },
          window.location.origin
        );
      }
    );
    return;
  }

  // Read completed eBay sales for one garment. The URL is built by the page
  // (lib/comps.ts) and re-checked in background.js before any tab is opened —
  // a page must not be able to name an arbitrary URL for the extension to load.
  if (data.type === "comps" && typeof data.url === "string") {
    chrome.runtime.sendMessage({ type: "comps", url: data.url }, (result) => {
      window.postMessage(
        {
          source: "threader-extension",
          type: "comps-read",
          ok: Boolean(result?.ok),
          error: result?.error ?? null,
          comps: result?.data?.comps ?? [],
          skipped: result?.data?.skipped ?? null,
          reportedTotal: result?.data?.reportedTotal ?? null,
          noResults: Boolean(result?.data?.noResults),
        },
        window.location.origin
      );
    });
    return;
  }

  if (data.type === "fill" && typeof data.listingId === "string") {
    chrome.runtime.sendMessage({ type: "fill", listingId: data.listingId }, (result) => {
      window.postMessage(
        {
          source: "threader-extension",
          type: "filled",
          listingId: data.listingId,
          ok: Boolean(result?.ok),
          error: result?.error ?? null,
          // What landed, not only what didn't. Without this a fill that
          // reported nothing missing was indistinguishable from one that
          // silently did half the job.
          filled: result?.data?.filled ?? [],
          missing: result?.data?.missing ?? [],
          blocked: result?.data?.blocked ?? [],
        },
        window.location.origin
      );
    });
  }
});
