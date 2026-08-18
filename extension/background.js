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
  vinted: "https://www.vinted.com/items/new",
  grailed: "https://www.grailed.com/sell/new",
};

/**
 * One selector per channel that only exists once the form has actually mounted.
 * Waiting for these beats waiting a fixed number of seconds: the pages differ by
 * seconds between loads, and a fixed wait either fails on a slow one or wastes
 * time on a fast one.
 */
const READY = {
  depop: "#description",
  mercari: "#sellName",
  vinted: "#title",
  grailed: 'input[name="title"]',
};

const FILLER = {
  depop: "fill-depop.js",
  mercari: "fill-mercari.js",
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

/** Polls in the page until the form exists, or gives up with a real error. */
async function waitForForm(tabId, selector, timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const [hit] = await chrome.scripting.executeScript({
        target: { tabId },
        func: (sel) => Boolean(document.querySelector(sel)),
        args: [selector],
      });
      if (hit?.result) return true;
    } catch {
      // Tab still navigating — executeScript throws until it settles.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

/**
 * Reads Depop's inbox and posts it to Threader.
 *
 * The thread list has the buyer and the preview; only the thread page has the
 * product link, and that link is the exact key that ties a conversation to a
 * garment. So this walks the threads one at a time in a single tab rather than
 * guessing a match from the item title.
 */
async function syncDepopMessages(maxThreads = 20) {
  const tab = await chrome.tabs.create({ url: "https://www.depop.com/messages/", active: false });
  try {
    await whenLoaded(tab.id);
    if (!(await waitForForm(tab.id, 'a[href^="/messages/"]', 20000))) {
      throw new Error("Depop's inbox didn't load. Check you're signed in.");
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["read-depop-messages.js"],
    });
    const list = await chrome.tabs.sendMessage(tab.id, { type: "depop-read-list" });
    const threads = (list?.threads ?? []).slice(0, maxThreads);

    const messages = [];
    for (const thread of threads) {
      await chrome.tabs.update(tab.id, { url: thread.url });
      await whenLoaded(tab.id);
      await new Promise((r) => setTimeout(r, 2500)); // the pane renders after load

      let detail = { product_url: null, bubbles: [] };
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["read-depop-messages.js"],
        });
        detail = await chrome.tabs.sendMessage(tab.id, { type: "depop-read-thread" });
      } catch {
        // A thread that won't render shouldn't lose the rest of the sync.
      }

      const body = detail?.bubbles?.length
        ? detail.bubbles[detail.bubbles.length - 1]
        : thread.preview;

      messages.push({
        external_id: thread.id,
        thread_id: thread.id,
        sender: thread.sender,
        body,
        listing_url: detail?.product_url ?? null,
        raw: { when: thread.when, bubbles: detail?.bubbles ?? [] },
      });
    }

    return await api("/api/ext/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ channel: "depop", messages }),
    });
  } finally {
    await chrome.tabs.remove(tab.id).catch(() => {});
  }
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
        if (background === true) {
          const win = await chrome.windows.create({ url, state: "minimized", focused: false });
          tab = win.tabs[0];
        } else {
          tab = await chrome.tabs.create({ url });
        }
        await whenLoaded(tab.id);

        const ready = await waitForForm(tab.id, READY[payload.channel] ?? "form");
        if (!ready) {
          throw new Error(
            `${payload.channel} didn't render its sell form. Open the tab and check you're signed in.`
          );
        }

        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [filler] });
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

      if (message.type === "sync-messages") {
        if (message.channel !== "depop") {
          throw new Error(`No message reader for ${message.channel} yet.`);
        }
        sendResponse({ ok: true, data: await syncDepopMessages() });
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

/* ==========================================================================
   Background sync
   --------------------------------------------------------------------------
   Why this lives in the extension and not on the server:

   Depop, Poshmark, Grailed, Vinted and Mercari have no public API for reading
   your own shop. There is no key to give a server and no way for one to
   authenticate as the seller. The extension is the only thing that holds the
   session, so any polling has to happen here, in the seller's own browser,
   using the tab they're already signed into. eBay is the exception — once its
   API approval lands, that one can be polled server-side properly.

   The alarm is deliberately infrequent. Each run opens a background tab and
   walks message threads; doing that every few minutes would be both visible to
   the seller and exactly the traffic pattern a marketplace looks for.
   ========================================================================== */

const SYNC_ALARM = "threader-sync";
const SYNC_MINUTES = 30;

chrome.runtime.onInstalled.addListener(() => scheduleSync());
chrome.runtime.onStartup.addListener(() => scheduleSync());

async function scheduleSync() {
  await chrome.alarms.clear(SYNC_ALARM);
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_MINUTES, delayInMinutes: 2 });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== SYNC_ALARM) return;

  // Unpaired means there's nowhere to send what we read; don't open tabs for
  // nothing, and don't nag.
  const { token } = await chrome.storage.local.get(["token"]);
  if (!token) return;

  // Never more than twice an hour, even if alarms double-fire after the
  // machine wakes. The sync tab opens with active:false so it doesn't steal
  // focus; this throttle is what keeps the traffic pattern unremarkable.
  const { lastSyncAt } = await chrome.storage.local.get(["lastSyncAt"]);
  if (Date.now() - (lastSyncAt ?? 0) < 25 * 60 * 1000) return;

  try {
    const result = await syncDepopMessages();
    await chrome.storage.local.set({
      lastSyncAt: Date.now(),
      lastSyncResult: { ok: true, ...result },
    });
  } catch (error) {
    await chrome.storage.local.set({
      lastSyncAt: Date.now(),
      lastSyncResult: { ok: false, error: error.message },
    });
  }
});
