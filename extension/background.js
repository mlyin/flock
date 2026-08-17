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
  mercari: "https://www.mercari.com/sell/",
};

const FILLER = {
  depop: "fill-depop.js",
  mercari: "fill-mercari.js",
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

/** Resolves once the tab has finished loading. */
function whenLoaded(tabId) {
  return new Promise((resolve) => {
    const listener = (id, info) => {
      if (id === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
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

        const tab = await chrome.tabs.create({ url });
        await whenLoaded(tab.id);

        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [filler] });
        // Give the SPA a moment to mount its form before we start looking for fields.
        await new Promise((r) => setTimeout(r, 1500));
        const result = await chrome.tabs.sendMessage(tab.id, { type: "apply", payload });

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
