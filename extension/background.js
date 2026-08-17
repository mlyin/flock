/**
 * Fetches a listing payload from Threader, opens the marketplace's sell page,
 * and injects the filler.
 *
 * It never submits. The user reviews the filled form and clicks the button
 * themselves — that's both the honest boundary when it's their marketplace
 * account and the thing that keeps this looking like a person rather than a bot.
 */

const SELL_PAGE = {
  depop: "https://www.depop.com/products/create/",
  vinted: "https://www.vinted.com/items/new",
  grailed: "https://www.grailed.com/sell/new",
};

const FILLER = {
  depop: "fill-depop.js",
  vinted: "fill-vinted.js",
  grailed: "fill-grailed.js",
};

async function config() {
  const { token, apiBase } = await chrome.storage.local.get(["token", "apiBase"]);
  return { token, apiBase: apiBase || "https://getthreader.com" };
}

async function api(path, options = {}) {
  const { token, apiBase } = await config();
  if (!token) throw new Error("Not paired. Open the Threader extension and enter your code.");

  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: { ...(options.headers || {}), authorization: `Bearer ${token}` },
  });

  if (response.status === 401) throw new Error("Pairing code rejected. Generate a new one in Threader.");
  if (!response.ok) throw new Error(`Threader returned ${response.status}.`);
  return response.json();
}

/**
 * Resolves once the tab has finished loading.
 *
 * Checks the current status first: a cached page can reach "complete" before
 * the listener is attached, and waiting for an event that already fired hangs
 * forever. The timeout is the backstop — a stuck load should surface as an
 * error, not as a spinner nobody can clear.
 */
function whenLoaded(tabId, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(timer);
      fn(arg);
    };

    const listener = (id, info) => {
      if (id === tabId && info.status === "complete") finish(resolve);
    };

    const timer = setTimeout(
      () => finish(reject, new Error("The marketplace page didn't finish loading.")),
      timeoutMs
    );

    chrome.tabs.onUpdated.addListener(listener);

    // Already done before we started listening?
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) return finish(reject, new Error(chrome.runtime.lastError.message));
      if (tab?.status === "complete") finish(resolve);
    });
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      if (message.type === "queue") {
        sendResponse({ ok: true, data: await api("/api/ext/queue") });
        return;
      }

      if (message.type === "fill") {
        const payload = await api(`/api/ext/listing/${message.listingId}`);
        const url = SELL_PAGE[payload.channel];
        const filler = FILLER[payload.channel];
        if (!url || !filler) throw new Error(`No filler for ${payload.channel} yet.`);

        const { background, autoSubmit } = await chrome.storage.local.get([
          "background",
          "autoSubmit",
        ]);

        // A minimised window keeps the page out of your way while it fills.
        // An extension can't drive a truly headless page — the marketplace is a
        // React app and needs a real renderer to mount its form at all.
        let tab;
        if (background === false) {
          tab = await chrome.tabs.create({ url });
        } else {
          const win = await chrome.windows.create({ url, state: "minimized", focused: false });
          tab = win.tabs[0];
        }
        await whenLoaded(tab.id);

        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [filler] });
        // Give the SPA a moment to mount its form before we start looking for fields.
        await new Promise((r) => setTimeout(r, 4000)); // SPAs need real time to mount
        const result = await chrome.tabs.sendMessage(tab.id, {
          type: "apply",
          payload,
          autoSubmit: Boolean(autoSubmit),
        });

        // If anything is still missing, the decision is yours — bring the
        // window forward rather than leaving a half-filled form minimised
        // where you'd never notice it.
        if (result?.missing?.length || result?.blocked?.length) {
          await chrome.windows.update(tab.windowId, { state: "normal", focused: true });
        }

        sendResponse({ ok: true, data: result });
        return;
      }

      if (message.type === "posted") {
        sendResponse({
          ok: true,
          data: await api(`/api/ext/listing/${message.listingId}/posted`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ url: message.url }),
          }),
        });
        return;
      }

      sendResponse({ ok: false, error: `Unknown message: ${message.type}` });
    } catch (error) {
      sendResponse({ ok: false, error: error.message });
    }
  })();

  return true; // keep the channel open for the async reply
});
