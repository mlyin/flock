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
document.documentElement.setAttribute("data-threader-extension", "1");
window.postMessage({ source: "threader-extension", type: "ready" }, window.location.origin);

window.addEventListener("message", (event) => {
  // Same-origin only: never act on a message another site framed in.
  if (event.origin !== window.location.origin) return;
  if (event.source !== window) return;

  const data = event.data;
  if (!data || data.source !== "threader-page") return;

  // Extension preferences live in chrome.storage.local, which no page can
  // touch — so the settings UI asks the extension to read and write them.
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

  if (data.type === "fill" && typeof data.listingId === "string") {
    chrome.runtime.sendMessage({ type: "fill", listingId: data.listingId }, (result) => {
      window.postMessage(
        {
          source: "threader-extension",
          type: "filled",
          listingId: data.listingId,
          ok: Boolean(result?.ok),
          error: result?.error ?? null,
          missing: result?.data?.missing ?? [],
          blocked: result?.data?.blocked ?? [],
        },
        window.location.origin
      );
    });
  }
});
